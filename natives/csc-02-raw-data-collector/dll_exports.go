//go:build dll

package main

import "C"

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"unsafe"
)

var execMu sync.Mutex

// resultBuf는 DLL이 소유하는 결과 버퍼다. Go 패키지 레벨 변수라 GC 대상이 아니다.
// execMu로 직렬화되므로 동시 접근 없음.
var resultBuf [65536]byte

// dllResult는 JSON 직렬화용 결과 구조체다.
type dllResult struct {
	Ok         bool     `json:"ok"`
	Downloaded int      `json:"downloaded"`
	Errors     []string `json:"errors"`
}

// writeResultBuf는 결과를 JSON으로 직렬화해 정적 C 버퍼에 기록하고 포인터를 반환한다.
// 호출자는 반환된 포인터를 free할 필요가 없다.
func writeResultBuf(downloaded int, errors []string) *C.char {
	if errors == nil {
		errors = []string{}
	}
	r := dllResult{
		Ok:         len(errors) == 0,
		Downloaded: downloaded,
		Errors:     errors,
	}
	b, _ := json.Marshal(r)

	n := len(b)
	if n > 65535 {
		n = 65535
	}

	copy(resultBuf[:n], b)
	resultBuf[n] = 0

	return (*C.char)(unsafe.Pointer(&resultBuf[0]))
}

// FetchRawData는 configPath 설정 파일을 읽어 FTP 수집을 1회 실행한다.
// 항상 JSON 문자열을 반환한다. 반환된 포인터는 DLL 내부 버퍼를 가리키므로 free 불필요.
// 호출자는 다음 FetchRawData 호출 전에 반환값을 복사하거나 파싱해야 한다.
//
// JSON 형식: {"ok": bool, "downloaded": int, "errors": ["파일명: 오류", ...]}
//
//export FetchRawData
func FetchRawData(configPath *C.char) *C.char {
	execMu.Lock()
	defer execMu.Unlock()

	path := C.GoString(configPath)

	cfg, err := loadConfig(path)
	if err != nil {
		return writeResultBuf(0, []string{fmt.Sprintf("loadConfig: %v", err)})
	}
	applyDefaults(&cfg)

	if cfg.NASFinalDir == "" || cfg.NASTmpDir == "" {
		return writeResultBuf(0, []string{"nas_final_dir / nas_tmp_dir must be set"})
	}

	if err := os.MkdirAll(cfg.NASFinalDir, 0o755); err != nil {
		return writeResultBuf(0, []string{fmt.Sprintf("MkdirAll nas_final_dir: %v", err)})
	}
	if err := os.MkdirAll(cfg.NASTmpDir, 0o755); err != nil {
		return writeResultBuf(0, []string{fmt.Sprintf("MkdirAll nas_tmp_dir: %v", err)})
	}

	// 이전 호출이 비정상 종료된 경우 .part 파일 정리
	cleanupPartFiles(cfg.NASTmpDir)

	// DLL은 재시도 없이 즉시 실패 반환 (재시도는 외부 호출자가 담당)
	cfg.RetryMax = 1

	// received.json을 매 호출마다 재로드 (DLL은 호출 간 상태를 유지하지 않음)
	receivedPath := cfgPathToReceived(path, cfg)
	idx, hadIdx, err := loadReceivedIndex(receivedPath)
	if err != nil {
		return writeResultBuf(0, []string{fmt.Sprintf("loadReceivedIndex: %v", err)})
	}
	if !hadIdx {
		fmt.Println("[BOOTSTRAP] received.json missing -> build from NAS")
		idx = bootstrapIndexFromNAS(cfg)
		if err := saveReceivedIndex(receivedPath, idx); err != nil {
			return writeResultBuf(0, []string{fmt.Sprintf("saveReceivedIndex(bootstrap): %v", err)})
		}
	}

	result, err := runOnce(context.Background(), cfg, idx, receivedPath)
	if err != nil {
		errs := append(result.Errors, fmt.Sprintf("runOnce: %v", err))
		return writeResultBuf(result.Downloaded, errs)
	}
	return writeResultBuf(result.Downloaded, result.Errors)
}

// main은 c-shared 빌드모드에 필요한 빈 진입점이다.
func main() {}
