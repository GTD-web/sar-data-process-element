package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jlaffaye/ftp"
)

type Config struct {
	FTPHost       string `json:"ftp_host"`
	FTPPort       int    `json:"ftp_port"`
	FTPUser       string `json:"ftp_user"`
	FTPPass       string `json:"ftp_pass"`
	FTPTimeoutSec int    `json:"ftp_timeout_sec"`

	RemoteWatchDir string `json:"remote_watch_dir"`

	NASFinalDir string `json:"nas_final_dir"`
	NASTmpDir   string `json:"nas_tmp_dir"`

	LookbackDays  int `json:"lookback_days"`
	MinAgeMinutes int `json:"min_age_minutes"`

	MaxParallelDownloads int `json:"max_parallel_downloads"`
	RetryMax             int `json:"-"` // 내부 제어용 (config.json 비노출)

	// Cortex HDR 파일명이 "YYYYMMDDhhmmss"로 시작한다는 전제
	FilenameTimeLayout string `json:"filename_time_layout"`

	// (선택) 특정 확장자만 수집하고 싶다면 설정. 비어있으면 모두.
	AllowedExtensions []string `json:"allowed_extensions"`
}

type ReceivedIndex struct {
	Done      map[string]ReceivedMeta `json:"done"`
	UpdatedAt string                  `json:"updated_at"`
}

type ReceivedMeta struct {
	ReceivedAt string `json:"received_at"`
	Size       int64  `json:"size"`
}

type RemoteFile struct {
	Name string
	Size int64
	Time time.Time
}

// RunResult는 runOnce 한 번 실행의 결과를 담는다.
type RunResult struct {
	Downloaded int
	Errors     []string // "파일명: 오류 메시지" 형식
}

var (
	reTsPrefix = regexp.MustCompile(`^(\d{14})`)
)

// applyDefaults는 Config의 미설정(zero) 필드에 기본값을 채운다.
func applyDefaults(cfg *Config) {
	if cfg.FTPPort == 0 {
		cfg.FTPPort = 21
	}
	if cfg.FTPTimeoutSec <= 0 {
		cfg.FTPTimeoutSec = 30
	}
	if cfg.LookbackDays <= 0 {
		cfg.LookbackDays = 7
	}
	if cfg.MinAgeMinutes <= 0 {
		cfg.MinAgeMinutes = 3
	}
	if cfg.MaxParallelDownloads <= 0 {
		cfg.MaxParallelDownloads = 1
	}
	if cfg.RetryMax <= 0 {
		cfg.RetryMax = 5
	}
	if cfg.FilenameTimeLayout == "" {
		cfg.FilenameTimeLayout = "20060102150405"
	}
	if cfg.RemoteWatchDir == "" {
		cfg.RemoteWatchDir = "/"
	}
}

func cfgPathToReceived(_ string, cfg Config) string {
	return filepath.Join(cfg.NASFinalDir, "received.json")
}

func loadConfig(path string) (Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(b, &cfg); err != nil {
		return Config{}, err
	}
	if cfg.FTPHost == "" {
		return Config{}, fmt.Errorf("ftp_host must be set")
	}
	return cfg, nil
}

func loadReceivedIndex(path string) (*ReceivedIndex, bool, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &ReceivedIndex{Done: map[string]ReceivedMeta{}}, false, nil
		}
		return nil, false, err
	}
	var idx ReceivedIndex
	if err := json.Unmarshal(b, &idx); err != nil {
		return nil, true, err
	}
	if idx.Done == nil {
		idx.Done = map[string]ReceivedMeta{}
	}
	return &idx, true, nil
}

func saveReceivedIndex(path string, idx *ReceivedIndex) error {
	idx.UpdatedAt = time.Now().Format(time.RFC3339)
	tmp := path + ".tmp"
	b, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func dialFTP(cfg Config) (*ftp.ServerConn, error) {
	addr := fmt.Sprintf("%s:%d", cfg.FTPHost, cfg.FTPPort)
	c, err := ftp.Dial(addr, ftp.DialWithTimeout(time.Duration(cfg.FTPTimeoutSec)*time.Second))
	if err != nil {
		return nil, err
	}
	if err := c.Login(cfg.FTPUser, cfg.FTPPass); err != nil {
		_ = c.Quit()
		return nil, err
	}
	return c, nil
}

func runOnce(ctx context.Context, cfg Config, idx *ReceivedIndex, receivedPath string) (RunResult, error) {
	var result RunResult

	c, err := dialFTP(cfg)
	if err != nil {
		return result, err
	}
	defer c.Quit()

	if err := c.ChangeDir(cfg.RemoteWatchDir); err != nil {
		return result, fmt.Errorf("ChangeDir(%s): %w", cfg.RemoteWatchDir, err)
	}

	entries, err := c.List(".")
	if err != nil {
		return result, fmt.Errorf("List: %w", err)
	}

	now := time.Now()
	cutoff := now.AddDate(0, 0, -cfg.LookbackDays)
	minAgeCutoff := now.Add(-time.Duration(cfg.MinAgeMinutes) * time.Minute)

	allowedExt := normalizeExts(cfg.AllowedExtensions)

	serverFiles := make([]RemoteFile, 0, len(entries))
	serverSet := make(map[string]RemoteFile)

	for _, e := range entries {
		if e.Type != ftp.EntryTypeFile {
			continue
		}
		name := e.Name

		if !isAllowedExt(name, allowedExt) {
			continue
		}

		tm, ok := parseTimeFromName(name, cfg.FilenameTimeLayout)
		if !ok {
			continue
		}

		if tm.Before(cutoff) {
			continue
		}

		rf := RemoteFile{
			Name: name,
			Size: int64(e.Size),
			Time: tm,
		}
		serverFiles = append(serverFiles, rf)
		serverSet[name] = rf
	}

	pruneIndexByServer(idx, serverSet)

	candidates := make([]RemoteFile, 0)
	for _, rf := range serverFiles {
		if rf.Time.After(minAgeCutoff) {
			continue
		}
		if _, done := idx.Done[rf.Name]; done {
			continue
		}
		candidates = append(candidates, rf)
	}
	if len(candidates) == 0 {
		return result, nil
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Name < candidates[j].Name
	})

	fmt.Printf("[INFO] candidates=%d (after filters)\n", len(candidates))

	sem := make(chan struct{}, cfg.MaxParallelDownloads)
	var wg sync.WaitGroup
	var mu sync.Mutex // idx.Done 및 result 보호

	canceled := false
	for _, rf := range candidates {
		rf := rf

		select {
		case <-ctx.Done():
			canceled = true
		default:
		}
		if canceled {
			break
		}

		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			canceled = true
		}
		if canceled {
			break
		}

		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			select {
			case <-ctx.Done():
				return
			default:
			}

			if err := downloadWithRetry(ctx, cfg, rf); err != nil {
				if errors.Is(err, context.Canceled) {
					return
				}
				fmt.Printf("[DL][FAIL] %s : %v\n", rf.Name, err)
				mu.Lock()
				result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", rf.Name, err))
				mu.Unlock()
				return
			}

			mu.Lock()
			idx.Done[rf.Name] = ReceivedMeta{
				ReceivedAt: time.Now().Format(time.RFC3339),
				Size:       fileSizeMust(filepath.Join(cfg.NASFinalDir, rf.Name)),
			}
			result.Downloaded++
			if err := saveReceivedIndex(receivedPath, idx); err != nil {
				fmt.Printf("[ERR] save received.json after %s: %v", rf.Name, err)
			}
			mu.Unlock()

			fmt.Printf("[DL][OK] %s\n", rf.Name)
		}()
	}
	wg.Wait()
	if canceled {
		return result, ctx.Err()
	}
	return result, nil
}

func downloadWithRetry(ctx context.Context, cfg Config, rf RemoteFile) error {
	var lastErr error
	backoffs := []time.Duration{5 * time.Second, 15 * time.Second, 60 * time.Second, 180 * time.Second, 300 * time.Second}

	for attempt := 1; attempt <= cfg.RetryMax; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := downloadOne(ctx, cfg, rf); err != nil {
			lastErr = err
			wait := backoffs[min(attempt-1, len(backoffs)-1)]
			fmt.Printf("[DL][RETRY] %s attempt=%d/%d err=%v wait=%s\n", rf.Name, attempt, cfg.RetryMax, err, wait)
			select {
			case <-time.After(wait):
			case <-ctx.Done():
				return ctx.Err()
			}
			continue
		}
		return nil
	}
	return lastErr
}

func downloadOne(ctx context.Context, cfg Config, rf RemoteFile) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	finalPath := filepath.Join(cfg.NASFinalDir, rf.Name)
	if st, err := os.Stat(finalPath); err == nil && st.Mode().IsRegular() && st.Size() > 0 {
		return nil
	}
	c, err := dialFTP(cfg)
	if err != nil {
		return err
	}
	defer c.Quit()

	if err := c.ChangeDir(cfg.RemoteWatchDir); err != nil {
		return fmt.Errorf("ChangeDir: %w", err)
	}

	remoteSize, err := c.FileSize(rf.Name)
	if err == nil && remoteSize == 0 {
		return fmt.Errorf("remote size is 0 (not ready)")
	}

	partName := rf.Name + ".part"
	partPath := filepath.Join(cfg.NASTmpDir, partName)
	_ = os.Remove(partPath)

	r, err := c.Retr(rf.Name)
	if err != nil {
		return err
	}

	doneCh := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = r.Close()
		case <-doneCh:
		}
	}()
	defer close(doneCh)

	f, err := os.OpenFile(partPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}

	n, err := io.Copy(f, r)
	if err != nil {
		_ = r.Close()
		_ = f.Close()
		_ = os.Remove(partPath)
		return err
	}
	_ = r.Close()

	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(partPath)
		return err
	}
	_ = f.Close()

	if n <= 0 {
		_ = os.Remove(partPath)
		return fmt.Errorf("downloaded 0 bytes")
	}

	if remoteSize > 0 && n != remoteSize {
		_ = os.Remove(partPath)
		return fmt.Errorf("size mismatch remote=%d local=%d", remoteSize, n)
	}

	if err := os.Rename(partPath, finalPath); err != nil {
		if err2 := copyFile(partPath, finalPath); err2 != nil {
			return err2
		}
		_ = os.Remove(partPath)
	}

	return nil
}

func bootstrapIndexFromNAS(cfg Config) *ReceivedIndex {
	idx := &ReceivedIndex{Done: map[string]ReceivedMeta{}}
	now := time.Now()
	cutoff := now.AddDate(0, 0, -cfg.LookbackDays)
	allowedExt := normalizeExts(cfg.AllowedExtensions)

	filepath.WalkDir(cfg.NASFinalDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if filepath.Clean(path) == filepath.Clean(cfg.NASTmpDir) {
				return filepath.SkipDir
			}
			return nil
		}
		name := d.Name()
		if strings.HasSuffix(name, ".part") {
			return nil
		}
		if !isAllowedExt(name, allowedExt) {
			return nil
		}
		tm, ok := parseTimeFromName(name, cfg.FilenameTimeLayout)
		if !ok || tm.Before(cutoff) {
			return nil
		}
		info, e := d.Info()
		if e != nil || info.Size() <= 0 {
			return nil
		}
		idx.Done[name] = ReceivedMeta{
			ReceivedAt: time.Now().Format(time.RFC3339),
			Size:       info.Size(),
		}
		return nil
	})

	fmt.Printf("[BOOTSTRAP] done=%d from NAS\n", len(idx.Done))
	return idx
}

func pruneIndexByServer(idx *ReceivedIndex, serverSet map[string]RemoteFile) {
	if idx.Done == nil {
		idx.Done = map[string]ReceivedMeta{}
		return
	}
	for k := range idx.Done {
		if _, ok := serverSet[k]; !ok {
			delete(idx.Done, k)
		}
	}
}

func parseTimeFromName(name, layout string) (time.Time, bool) {
	m := reTsPrefix.FindStringSubmatch(name)
	if len(m) != 2 {
		return time.Time{}, false
	}
	tm, err := time.ParseInLocation(layout, m[1], time.Local)
	if err != nil {
		return time.Time{}, false
	}
	return tm, true
}

func normalizeExts(exts []string) map[string]struct{} {
	m := map[string]struct{}{}
	for _, e := range exts {
		e = strings.TrimSpace(strings.ToLower(e))
		if e == "" {
			continue
		}
		if !strings.HasPrefix(e, ".") {
			e = "." + e
		}
		m[e] = struct{}{}
	}
	if len(m) == 0 {
		return nil
	}
	return m
}

func isAllowedExt(name string, allowed map[string]struct{}) bool {
	if allowed == nil {
		return true
	}
	ext := strings.ToLower(filepath.Ext(name))
	_, ok := allowed[ext]
	return ok
}

func cleanupPartFiles(tmpDir string) {
	entries, err := os.ReadDir(tmpDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := strings.ToLower(e.Name())
		if strings.HasSuffix(name, ".part") {
			_ = os.Remove(filepath.Join(tmpDir, e.Name()))
		}
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func fileSizeMust(path string) int64 {
	st, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return st.Size()
}

func fatal(err error) {
	fmt.Println("[FATAL]", err)
	os.Exit(1)
}
