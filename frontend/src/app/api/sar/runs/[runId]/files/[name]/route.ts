/**
 * Run 산출 파일 정적 서빙. PNG / XML / TIFF 등 자유.
 * Path traversal 방지: name 은 basename 만 허용 (슬래시/`..` 거부) + realpath 검증.
 */

import { NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getRun } from '@/server/sar/run-store';
import { mimeType } from '@/server/sar/stage-runner';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; name: string }> },
): Promise<Response> {
  const { runId, name: rawName } = await params;
  const name = decodeURIComponent(rawName);

  // basename guard
  if (name.includes('/') || name.includes('\\') || name.includes('..') || name === '') {
    return new Response('Invalid file name', { status: 400 });
  }

  const run = getRun(runId);
  if (!run) return new Response('Run not found', { status: 404 });

  const filePath = path.join(run.outputDir, name);
  let realFile: string;
  let realDir: string;
  try {
    realFile = await realpath(filePath);
    realDir = await realpath(run.outputDir);
  } catch {
    return new Response('File not found', { status: 404 });
  }
  // realpath traversal guard
  if (!realFile.startsWith(realDir + path.sep) && realFile !== realDir) {
    return new Response('Forbidden', { status: 403 });
  }

  const s = await stat(realFile);
  if (!s.isFile()) return new Response('Not a file', { status: 404 });

  const nodeStream = createReadStream(realFile);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      'Content-Type': mimeType(name),
      'Content-Length': String(s.size),
      'Cache-Control': 'no-store',
    },
  });
}
