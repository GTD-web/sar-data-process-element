/**
 * SAR 실행 API 의 브라우저 측 thin wrapper.
 * 시연 한정 — NodeDetailModal 에서만 호출. 별도 인터페이스로 분리하지 않는다
 * (mock/current 패턴은 파이프라인 메타 CRUD 용도, 실제 처리 실행은 데모 전용).
 */

import type { SarStage, SarSubStage } from '@/types/pipeline';

/** 백엔드 STAGE_CONFIG 의 stage id (frontend SarStage 와는 분리). */
export type SarStageId = 'L1A' | 'L1B_MULTILOOK' | 'L1B_SPECKLE';

/**
 * SarStage(UI 노드 stage) + 선택적 sarSubStage → STAGE_CONFIG stage id + 실행 params.
 * L1B 처럼 한 stage 안에 여러 CSU/필터가 있는 경우 sub-stage 가 stage id 와 params 를 결정.
 */
export interface ResolvedStage {
  id: SarStageId;
  /** STAGE_CONFIG.buildArgs 에 그대로 전달 — speckle 의 filter 종류 등 */
  params?: Record<string, string | number | undefined>;
}

export function resolveSarStage(
  sarStage: SarStage,
  sarSubStage?: SarSubStage,
): ResolvedStage | null {
  if (sarStage === 'L1A') return { id: 'L1A' };

  if (sarStage === 'L1B') {
    // sub-stage 가 있으면 그 종류로 분기, 없으면 default = multilook
    const sub = sarSubStage ?? { kind: 'multilook' as const };
    if (sub.kind === 'multilook') {
      return {
        id: 'L1B_MULTILOOK',
        params: {
          range_looks: sub.rangeLooks,
          azimuth_looks: sub.azimuthLooks,
        },
      };
    }
    if (sub.kind === 'speckle') {
      return {
        id: 'L1B_SPECKLE',
        params: {
          filter: sub.filter,
          win_x: sub.winX,
          win_y: sub.winY,
        },
      };
    }
    // ground-range / grd → 미구현 (CSU-04.07/08), mock fallback
    return null;
  }

  // L0(CSC-03), L1C/L2A/L2B/L3 는 미구현
  return null;
}

/** 하위 호환 — sub-stage 없는 옛 호출처용. resolveSarStage 권장. */
export function mapSarStageToStageId(sarStage: SarStage): SarStageId | null {
  return resolveSarStage(sarStage)?.id ?? null;
}

export interface UploadResponse {
  uploadId: string;
  filename: string;
  sizeBytes: number;
}

export interface ExecuteResponse {
  runId: string;
  stage: SarStageId;
  exitCode: number;
  stdout: string;
  stderr: string;
  args: string[];
  primary?: string;
  meta?: string;
  files: Array<{
    name: string;
    url: string;
    kind: 'image' | 'meta' | 'data' | 'other';
    sizeBytes: number;
  }>;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  /** bytes per second since upload started */
  bytesPerSec: number;
}

/**
 * H5 raw body POST → uploadId 반환.
 * fetch 대신 XHR 을 쓰는 이유: `upload.onprogress` 가 있어야 큰 파일 진행률 표시 가능
 * (fetch 의 ReadableStream 으로는 업로드 progress 가 표준화돼 있지 않음).
 */
export async function uploadH5(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResponse> {
  return new Promise<UploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = performance.now();
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      const elapsedSec = (performance.now() - startedAt) / 1000;
      const bytesPerSec = elapsedSec > 0 ? e.loaded / elapsedSec : 0;
      onProgress({ loaded: e.loaded, total: e.total, bytesPerSec });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse);
        } catch (err) {
          reject(new Error(`upload: invalid JSON response: ${err instanceof Error ? err.message : String(err)}`));
        }
      } else {
        reject(new Error(`upload failed: HTTP ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('upload network error'));
    xhr.onabort = () => reject(new Error('upload aborted'));
    xhr.open('POST', '/api/sar/upload');
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.setRequestHeader('x-filename', file.name);
    xhr.send(file);
  });
}

export interface BundleUploadResponse {
  runId: string;
  primary: string;
  meta?: string;
  sizeBytes: number;
}

/**
 * L1B 직접 업로드 — SLC/MLD TIFF (+ 선택적 metadata XML) 를 multipart 로 보내고
 * 서버가 "가상의 prev run" 으로 등록해 돌려주는 runId 를 받는다.
 * 호출 측은 이 runId 를 execute 시 inputRunId 로 넘긴다.
 */
export async function uploadBundle(
  primary: File,
  meta?: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<BundleUploadResponse> {
  return new Promise<BundleUploadResponse>((resolve, reject) => {
    const form = new FormData();
    form.append('primary', primary);
    if (meta) form.append('meta', meta);
    const xhr = new XMLHttpRequest();
    const startedAt = performance.now();
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      const elapsedSec = (performance.now() - startedAt) / 1000;
      const bytesPerSec = elapsedSec > 0 ? e.loaded / elapsedSec : 0;
      onProgress({ loaded: e.loaded, total: e.total, bytesPerSec });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as BundleUploadResponse);
        } catch (err) {
          reject(new Error(`upload-bundle: invalid JSON response: ${err instanceof Error ? err.message : String(err)}`));
        }
      } else {
        reject(new Error(`upload-bundle failed: HTTP ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('upload-bundle network error'));
    xhr.onabort = () => reject(new Error('upload-bundle aborted'));
    xhr.open('POST', '/api/sar/upload-bundle');
    xhr.send(form);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming execute (SSE)
// 서버는 줄 단위 stdout/stderr 를 SSE 로 흘리고, 마지막에 'done' 이벤트로
// runId/files/exitCode 등 메타를 전송한다.
// ─────────────────────────────────────────────────────────────────────────────

export type ExecuteEvent =
  | {
      type: 'log';
      stream: 'stdout' | 'stderr';
      /**
       * 라인의 실제 로그 레벨. Python logging 은 INFO/WARNING 도 stderr 로 출력하므로
       * 서버에서 라인 텍스트를 보고 추론한 값이 함께 온다 (없으면 stream 기준 fallback).
       */
      level?: 'info' | 'warn' | 'error';
      line: string;
    }
  | { type: 'error'; message: string }
  | {
      type: 'done';
      runId: string;
      stage: SarStageId;
      exitCode: number;
      args: string[];
      primary?: string;
      meta?: string;
      files: ExecuteResponse['files'];
    };

/**
 * stage 실행 — SSE 스트림. 라인 단위 로그를 받기 위해 async iterator 형태.
 * 사용:
 *   for await (const ev of executeStageStream(...)) { ... }
 */
export async function* executeStageStream(
  stage: SarStageId,
  source: { uploadId?: string; inputRunId?: string },
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): AsyncGenerator<ExecuteEvent, void, void> {
  const res = await fetch('/api/sar/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stage, ...source, params }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`execute failed: HTTP ${res.status} ${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE 메시지는 빈 줄로 구분된다 (\n\n).
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const json = dataLine.slice(5).trim();
      if (!json) continue;
      try {
        yield JSON.parse(json) as ExecuteEvent;
      } catch {
        // 파싱 실패한 메시지는 그냥 건너뜀
      }
    }
  }
  // 마지막 fragment 가 \n\n 없이 끝나면 한 번 더 시도
  if (buffer.trim()) {
    const dataLine = buffer.split('\n').find((l) => l.startsWith('data:'));
    if (dataLine) {
      const json = dataLine.slice(5).trim();
      if (json) {
        try {
          yield JSON.parse(json) as ExecuteEvent;
        } catch {
          /* ignore */
        }
      }
    }
  }
}
