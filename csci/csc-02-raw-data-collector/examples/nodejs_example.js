/**
 * RawDataCollector DLL - Node.js 호출 예제
 * 요구사항: npm install ffi-napi ref-napi
 */

const ffi = require("ffi-napi");
const path = require("path");

function loadDll(dllPath) {
  return ffi.Library(dllPath, {
    // 반환 타입 'string': ffi-napi가 char*를 JS string으로 자동 복사 (free 불필요)
    FetchRawData: ["string", ["string"]],
  });
}

function fetch(dllPath, configPath) {
  const lib = loadDll(dllPath);
  const raw = lib.FetchRawData(configPath);
  // raw는 이미 JS string으로 복사된 상태 — DLL 버퍼와 무관
  return JSON.parse(raw);
}

// 비동기 버전 (논블로킹 호출이 필요한 경우)
function fetchAsync(dllPath, configPath) {
  return new Promise((resolve, reject) => {
    const lib = loadDll(dllPath);
    lib.FetchRawData.async(configPath, (err, raw) => {
      if (err) return reject(err);
      resolve(JSON.parse(raw));
    });
  });
}

// 직접 실행 시 동기 예제 수행
if (require.main === module) {
  const dllPath = path.join(__dirname, "..", "RawDataCollector.dll");
  const configPath = path.join(__dirname, "..", "config.json");

  const result = fetch(dllPath, configPath);

  if (result.ok) {
    console.log(`[OK] downloaded=${result.downloaded}`);
  } else {
    console.error(`[FAIL] downloaded=${result.downloaded}`);
    result.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

module.exports = { fetch, fetchAsync };
