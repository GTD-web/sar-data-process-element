/**
 * SAR stage 실행 — SSE 스트림 응답.
 *
 * Body: { stage: StageId, uploadId?: string, inputRunId?: string, params?: Record<string, ...> }
 *
 * 응답 (text/event-stream):
 *   data: {"type":"log","stream":"stdout","line":"..."}
 *   data: {"type":"log","stream":"stderr","line":"..."}
 *   data: {"type":"done","runId":"...","exitCode":0,"files":[...],"primary":"...","meta":"...","args":[...]}
 *
 * 클라이언트는 라인이 흘러올 때마다 터미널에 추가하고, 'done' 이벤트로 결과를 확정한다.
 */

import { NextRequest } from 'next/server';
import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { STAGE_CONFIG, type StageId, classifyFile } from '@/server/sar/stage-runner';
import { getRun, getUpload, registerRun } from '@/server/sar/run-store';

export const runtime = 'nodejs';
export const maxDuration = 1800;

/**
 * stderr 라인의 실제 로그 레벨 추출.
 * Python 의 logging 모듈은 INFO/WARNING/ERROR 모두 stderr 로 출력하므로
 * 라인 텍스트를 보고 진짜 레벨을 판단해야 한다 (그렇지 않으면 INFO 도 ERR 로 보여 혼란).
 */
function classifyStderrLine(line: string): 'info' | 'warn' | 'error' {
  if (/\b(CRITICAL|FATAL|Traceback|Exception)\b|^\s*\w+Error:|\bError:/.test(line)) return 'error';
  // "ERROR" 단독 (단어 경계) — Python logging 의 ERROR 레벨
  if (/\bERROR\b/.test(line)) return 'error';
  if (/\b(WARNING|WARN|Warning)\b/.test(line)) return 'warn';
  if (/\b(INFO|DEBUG)\b/.test(line)) return 'info';
  // 분류 안 되는 stderr (rasterio 의 stack snippet 등) → warn (default)
  return 'warn';
}

interface ExecuteBody {
  stage: StageId;
  uploadId?: string;
  inputRunId?: string;
  params?: Record<string, string | number | undefined>;
}

function sseError(message: string, status = 400): Response {
  // 에러를 JSON 으로 단일 SSE 이벤트로 흘려보낸다 (클라이언트는 type==='error' 처리).
  const payload = `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
  return new Response(payload, {
    status,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
    },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const runDir = process.env.SDPE_RUN_DIR;
  if (!runDir) return sseError('SDPE_RUN_DIR not set', 500);

  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return sseError('invalid json body');
  }

  const cfg = STAGE_CONFIG[body.stage];
  if (!cfg) return sseError(`unknown stage: ${body.stage}`);

  let uploadPath: string | undefined;
  let prevRun: { dir: string; primary?: string; meta?: string } | undefined;
  if (body.uploadId) {
    const up = getUpload(body.uploadId);
    if (!up) return sseError(`upload not found: ${body.uploadId}`, 404);
    uploadPath = up.path;
  } else if (body.inputRunId) {
    const prev = getRun(body.inputRunId);
    if (!prev) return sseError(`run not found: ${body.inputRunId}`, 404);
    prevRun = { dir: prev.outputDir, primary: prev.primary, meta: prev.meta };
  } else {
    return sseError('uploadId or inputRunId required');
  }

  const runId = randomUUID();
  const outputDir = path.join(runDir, runId);
  await mkdir(outputDir, { recursive: true });

  let args: string[];
  try {
    args = cfg.buildArgs({ uploadPath, prevRun, outputDir, params: body.params });
  } catch (err) {
    return sseError(err instanceof Error ? err.message : String(err));
  }

  // SSE ReadableStream 으로 spawn stdout/stderr 를 흘려보낸다.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      // -u: stdout/stderr 를 unbuffered 모드로 — 시연 SSE 가 print() 출력을
      // 라인 단위로 곧바로 받기 위해. 안 그러면 block buffering 으로 인해
      // 사용자 print() 가 process 종료 직전에야 한꺼번에 나타날 수 있다.
      const proc = spawn('python3', ['-u', cfg.script, ...args], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      // stdout/stderr 를 라인 단위로 분해해서 push.
      let stdoutBuf = '';
      let stderrBuf = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';
        for (const line of lines) {
          send({ type: 'log', stream: 'stdout', level: 'info', line });
        }
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() ?? '';
        for (const line of lines) {
          send({ type: 'log', stream: 'stderr', level: classifyStderrLine(line), line });
        }
      });

      proc.on('error', (err) => {
        send({ type: 'error', message: err.message });
        controller.close();
      });

      proc.on('close', async (code) => {
        // 남은 buffer flush
        if (stdoutBuf) send({ type: 'log', stream: 'stdout', level: 'info', line: stdoutBuf });
        if (stderrBuf) send({ type: 'log', stream: 'stderr', level: classifyStderrLine(stderrBuf), line: stderrBuf });

        const fileNames = await readdir(outputDir).catch(() => [] as string[]);
        const files = await Promise.all(
          fileNames.map(async (name) => {
            const s = await stat(path.join(outputDir, name)).catch(() => null);
            return {
              name,
              url: `/api/sar/runs/${runId}/files/${encodeURIComponent(name)}`,
              kind: classifyFile(name),
              sizeBytes: s?.size ?? 0,
            };
          }),
        );
        const { primary, meta } = cfg.resolveOutputs(outputDir, fileNames);
        registerRun({
          id: runId,
          stage: body.stage,
          outputDir,
          primary,
          meta,
          createdAt: Date.now(),
        });

        send({
          type: 'done',
          runId,
          stage: body.stage,
          exitCode: code ?? -1,
          args,
          primary,
          meta,
          files,
        });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      // Next.js 가 응답을 즉시 flush 하도록 — proxy 환경에서도 buffering 회피.
      'x-accel-buffering': 'no',
    },
  });
}
