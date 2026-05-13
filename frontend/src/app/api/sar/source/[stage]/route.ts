/**
 * SAR stage 의 **실제 소스 코드** 를 컨테이너에서 stream 한다 (read-only fetch).
 *
 * - URL: `GET /api/sar/source/L1A` 등 (stage 는 SarStage)
 * - 응답: `text/plain; charset=utf-8` + `X-Filename` 헤더
 * - 매핑 없는 stage 는 404 (호출자가 기존 mock fallback 사용)
 *
 * 모달의 CODE 섹션이 시연 시 진짜 코드를 보여주기 위함. 실제 STAGE_CONFIG 가 도는 진입점은
 * main.py 지만, 모달 시연 흐름에선 처리 단계와 1:1 매칭되는 csu_*.py 가 더 의미 있음.
 */

import { NextRequest } from 'next/server';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const NATIVES_DIR = process.env.SDPE_NATIVES_CSC04_DIR ?? '/app/natives/csc-04';

/** SarStage → natives 파일명. 변경 가능: 시연 의도에 맞춰 핵심 파일 1개씩 매핑. */
const SOURCE_BY_SAR_STAGE: Record<string, string> = {
  L1A: 'csu_04_01_range_compression.py',
  L1B: 'csu_04_05_multilook.py',
  // L0 (csc-03), L1C/L2A/L2B/L3 는 미구현 → 404 fallback
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ stage: string }> },
): Promise<Response> {
  const { stage } = await params;
  const filename = SOURCE_BY_SAR_STAGE[stage];
  if (!filename) {
    return new Response(`No source mapped for stage: ${stage}`, { status: 404 });
  }
  const target = path.join(NATIVES_DIR, filename);

  // realpath traversal guard — filename 은 화이트리스트라 사실상 안전하지만 방어적으로.
  let realFile: string;
  let realDir: string;
  try {
    realFile = await realpath(target);
    realDir = await realpath(NATIVES_DIR);
  } catch {
    return new Response('source file not found', { status: 404 });
  }
  if (!realFile.startsWith(realDir + path.sep)) {
    return new Response('forbidden', { status: 403 });
  }

  let body: string;
  try {
    body = await readFile(realFile, 'utf-8');
  } catch (err) {
    return new Response(
      `failed to read source: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 },
    );
  }

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'x-filename': filename,
      'cache-control': 'no-store',
    },
  });
}
