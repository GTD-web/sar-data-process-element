/**
 * 업로드/실행 메모리 캐시. Next.js Node 프로세스 수명 동안만 유지된다.
 * 시연 한정 — 컨테이너 재시작 시 모두 사라짐.
 */

export interface UploadEntry {
  id: string;
  path: string;
  filename: string;
  sizeBytes: number;
  createdAt: number;
}

export interface RunEntry {
  id: string;
  stage: string;
  outputDir: string;
  /** 다음 stage 의 입력으로 쓸 주요 산출 파일 (stage-runner 가 결정) */
  primary?: string;
  /** 메타데이터 파일 (있으면) */
  meta?: string;
  createdAt: number;
}

const uploads = new Map<string, UploadEntry>();
const runs = new Map<string, RunEntry>();

export function registerUpload(entry: UploadEntry): void {
  uploads.set(entry.id, entry);
}

export function getUpload(id: string): UploadEntry | undefined {
  return uploads.get(id);
}

export function registerRun(entry: RunEntry): void {
  runs.set(entry.id, entry);
}

export function getRun(id: string): RunEntry | undefined {
  return runs.get(id);
}
