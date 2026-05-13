/**
 * L1B 시연용 — 이전 stage 의 산출물(SLC TIFF + metadata XML, 혹은 MLD TIFF 단독)을
 * 직접 업로드해서 "가상의 prev run" 으로 등록한다.
 *
 * 일반 flow 는 L1A 실행 결과를 chain 으로 받지만, 사용자가 외부 SLC TIFF 를 가지고
 * L1B 만 단독 실행하고 싶을 수도 있다. 이 endpoint 는 그런 입력 경로를 위한 것.
 *
 * Body: multipart/form-data
 *   primary : File   (SLC*.tif / MLD*.tif — 필수)
 *   meta    : File?  (SLC_metadata*.xml  — multilook 에 필요. speckle 은 생략 가능)
 *
 * 반환: { runId, primary, meta?, sizeBytes }
 * 호출 측은 이 runId 를 execute 시 inputRunId 로 그대로 넘긴다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { registerRun } from '@/server/sar/run-store';

export const runtime = 'nodejs';
export const maxDuration = 1800;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const runDir = process.env.SDPE_RUN_DIR;
  if (!runDir) {
    return NextResponse.json({ error: 'SDPE_RUN_DIR not set' }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `invalid multipart body: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  const primary = form.get('primary');
  const meta = form.get('meta');
  if (!(primary instanceof File)) {
    return NextResponse.json({ error: 'primary file required (TIFF)' }, { status: 400 });
  }
  const primaryName = primary.name || 'primary.tif';
  if (!/\.tiff?$/i.test(primaryName)) {
    return NextResponse.json({ error: `primary must be a .tif/.tiff (got: ${primaryName})` }, { status: 400 });
  }

  let metaName: string | undefined;
  if (meta instanceof File) {
    metaName = meta.name || 'metadata.xml';
    if (!/\.xml$/i.test(metaName)) {
      return NextResponse.json({ error: `meta must be a .xml (got: ${metaName})` }, { status: 400 });
    }
  }

  const runId = randomUUID();
  const outputDir = path.join(runDir, runId);
  await mkdir(outputDir, { recursive: true });

  const primaryBytes = Buffer.from(await primary.arrayBuffer());
  await writeFile(path.join(outputDir, primaryName), primaryBytes);
  let metaBytes = 0;
  if (meta instanceof File && metaName) {
    const buf = Buffer.from(await meta.arrayBuffer());
    metaBytes = buf.length;
    await writeFile(path.join(outputDir, metaName), buf);
  }

  registerRun({
    id: runId,
    stage: 'BUNDLE',
    outputDir,
    primary: primaryName,
    meta: metaName,
    createdAt: Date.now(),
  });

  return NextResponse.json({
    runId,
    primary: primaryName,
    meta: metaName,
    sizeBytes: primaryBytes.length + metaBytes,
  });
}
