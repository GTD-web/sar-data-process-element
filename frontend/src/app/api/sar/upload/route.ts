/**
 * H5 업로드 — multipart 가 아니라 raw body POST.
 * 클라이언트는 fetch(url, { method: 'POST', body: file, headers: { 'X-Filename': name } }).
 * 큰 파일도 메모리에 다 올리지 않고 stream 으로 디스크에 흘려보낸다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { mkdir, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { registerUpload } from '@/server/sar/run-store';

export const runtime = 'nodejs';
export const maxDuration = 1800;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const uploadDir = process.env.SDPE_UPLOAD_DIR;
  if (!uploadDir) {
    return NextResponse.json({ error: 'SDPE_UPLOAD_DIR not set' }, { status: 500 });
  }
  if (!req.body) {
    return NextResponse.json({ error: 'no body' }, { status: 400 });
  }

  await mkdir(uploadDir, { recursive: true });

  const id = randomUUID();
  const filename = req.headers.get('x-filename') ?? `${id}.h5`;
  const dest = path.join(uploadDir, `${id}.h5`);

  const reader = req.body.getReader();
  const file = await open(dest, 'w');
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value);
      total += value.length;
    }
  } finally {
    await file.close();
  }

  registerUpload({
    id,
    path: dest,
    filename,
    sizeBytes: total,
    createdAt: Date.now(),
  });

  return NextResponse.json({ uploadId: id, filename, sizeBytes: total });
}
