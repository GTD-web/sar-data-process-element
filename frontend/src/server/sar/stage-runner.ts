/**
 * SAR stage → Python script 매핑 + 인자 빌더.
 * 새 stage 추가 시 STAGE_CONFIG 에 한 entry 만 등록한다.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

export type StageId = 'L1A' | 'L1B_MULTILOOK' | 'L1B_SPECKLE';

/** 직전 run 산출물에서 다음 stage 의 입력으로 쓸 파일 매핑. */
export interface PrevRunInput {
  /** 직전 run 의 outputDir 절대 경로 */
  dir: string;
  /** 다음 stage 의 주 입력 (예: SLC_complex.tif) */
  primary?: string;
  /** 메타데이터 (예: SLC_metadata.xml). 필요한 stage 만 사용 */
  meta?: string;
}

export interface BuildArgsContext {
  /** uploadId 로 들어온 H5 파일 경로 */
  uploadPath?: string;
  /** inputRunId 로 들어온 직전 run 산출물 정보 */
  prevRun?: PrevRunInput;
  /** 산출 디렉토리 (이 stage 의 outputDir) */
  outputDir: string;
  /** 사용자 파라미터 (decimate-range, range-looks 등) */
  params?: Record<string, string | number | undefined>;
}

export interface StageConfig {
  /** Python 스크립트 절대 경로 (컨테이너 내부) */
  script: string;
  /** spawn 인자 배열 빌더 */
  buildArgs: (ctx: BuildArgsContext) => string[];
  /**
   * 산출 디렉토리에서 다음 stage 가 입력으로 쓸 primary/meta 파일명 추출.
   * 정적 이름이면 그대로 반환, 동적이면 디렉토리 스캔 결과로 결정.
   */
  resolveOutputs: (outputDir: string, files: string[]) => { primary?: string; meta?: string };
}

const NATIVES_DIR = '/app/natives/csc-04';

export const STAGE_CONFIG: Record<StageId, StageConfig> = {
  // CSU-04.01/02/04 — H5 raw → SLC + QuickLook
  L1A: {
    script: path.join(NATIVES_DIR, 'main.py'),
    buildArgs: ({ uploadPath, outputDir, params }) => {
      if (!uploadPath) throw new Error('L1A requires uploadPath');
      // 시연 기본값: 16_resized.h5 (49280 az x 79504 rg) 기준 30초 안에 SLC + QuickLook 생성.
      // 사용자가 params 로 덮어쓸 수 있음.
      const azStart = params?.az_start ?? 3000;
      const azStop = params?.az_stop ?? 5000;
      const decimateRange = params?.decimate_range ?? 8;
      const block = params?.block ?? 1900;
      const overlap = params?.overlap ?? 500;
      const args = [
        '--input', uploadPath,
        '--output', outputDir,
        '--az-start', String(azStart),
        '--az-stop', String(azStop),
        '--decimate-range', String(decimateRange),
        '--block', String(block),
        '--overlap', String(overlap),
        '--workers', '1',
      ];
      if (params?.dry_run) args.push('--dry-run');
      return args;
    },
    resolveOutputs: (_outputDir, files) => {
      // 패키지가 SLC_complex_w10dec16.tif / SLC_metadata_w10dec16.xml 명으로 떨어뜨림.
      const tif = files.find((f) => f.startsWith('SLC_complex') && f.endsWith('.tif'));
      const xml = files.find((f) => f.startsWith('SLC_metadata') && f.endsWith('.xml'));
      return { primary: tif, meta: xml };
    },
  },

  // CSU-04.05 — SLC → Multi-look
  L1B_MULTILOOK: {
    script: path.join(NATIVES_DIR, 'csu_04_05_multilook.py'),
    buildArgs: ({ prevRun, outputDir, params }) => {
      if (!prevRun?.primary || !prevRun?.meta) {
        throw new Error('L1B_MULTILOOK requires prevRun with primary (SLC tif) and meta (xml)');
      }
      const slc = path.join(prevRun.dir, prevRun.primary);
      const xml = path.join(prevRun.dir, prevRun.meta);
      const rangeLooks = params?.range_looks ?? 4;
      const azimuthLooks = params?.azimuth_looks ?? 10;
      return [
        '--slc', slc,
        '--xml', xml,
        '--range-looks', String(rangeLooks),
        '--azimuth-looks', String(azimuthLooks),
        '--output', outputDir,
      ];
    },
    resolveOutputs: (_outputDir, files) => {
      // MLD_<R>R<A>A.tif / .xml 패턴
      const tif = files.find((f) => f.startsWith('MLD_') && f.endsWith('.tif'));
      const xml = files.find((f) => f.startsWith('MLD_') && f.endsWith('.xml'));
      return { primary: tif, meta: xml };
    },
  },

  // CSU-04.06 — Speckle Filtering
  L1B_SPECKLE: {
    script: path.join(NATIVES_DIR, 'csu_04_06_speckle_filter.py'),
    buildArgs: ({ prevRun, outputDir, params }) => {
      if (!prevRun?.primary) {
        throw new Error('L1B_SPECKLE requires prevRun with primary (MLD tif)');
      }
      const input = path.join(prevRun.dir, prevRun.primary);
      const filter = String(params?.filter ?? 'lee');
      const args = ['--input', input, '--filter', filter, '--output', outputDir];
      if (params?.win_x !== undefined) args.push('--win-x', String(params.win_x));
      if (params?.win_y !== undefined) args.push('--win-y', String(params.win_y));
      return args;
    },
    resolveOutputs: (_outputDir, files) => {
      const tif = files.find((f) => f.endsWith('.tif'));
      return { primary: tif };
    },
  },
};

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Python spawn → stdout/stderr 수집. 동기 실행 (Promise). */
export function runPython(script: string, args: string[], cwd?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [script, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

/** 파일명을 보고 시연 UI 분류 힌트 반환. */
export function classifyFile(name: string): 'image' | 'meta' | 'data' | 'other' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image';
  if (lower.endsWith('.xml') || lower.endsWith('.json')) return 'meta';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff') || lower.endsWith('.h5')) return 'data';
  return 'other';
}

/** name 의 mime type. 산출 파일 GET 응답에 사용. */
export function mimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  return 'application/octet-stream';
}
