import type { PipelineNodeKind, ProcessingProfile, ProductLevel, SarStage, SarSubStage } from '@/types/pipeline';

interface StepShape {
  kind: PipelineNodeKind;
  sarStage?: SarStage;
  inputLevel?: ProductLevel;
}

/**
 * 파이프라인이 "주로 어떤 처리 단계를 다루는지" 를 추정한다.
 *
 * 우선순위:
 *  1. 첫 SAR 노드의 sarStage
 *  2. SAR 노드가 없을 때 — 시작 노드 종류로 추정:
 *     - TRIGGER             → L0
 *     - FILE_INPUT LEVEL_0  → L1A
 *     - FILE_INPUT LEVEL_1  → L2A
 *     - FILE_INPUT LEVEL_2  → L3
 *
 * 프로파일 매칭(`processingStage`) 및 mismatch 경고에서 공통으로 사용한다.
 */
export function inferPipelineProcessingStage(steps: StepShape[]): string | undefined {
  const firstSar = steps.find((s) => s.kind === 'SAR');
  if (firstSar?.sarStage) return firstSar.sarStage;
  const start = steps[0];
  if (start?.kind === 'TRIGGER') return 'L0';
  if (start?.kind === 'FILE_INPUT') {
    return start.inputLevel === 'LEVEL_0'
      ? 'L1A'
      : start.inputLevel === 'LEVEL_1'
        ? 'L2A'
        : start.inputLevel === 'LEVEL_2'
          ? 'L3'
          : undefined;
  }
  return undefined;
}

/**
 * 시작 노드 / 첫 SAR 단계에 매칭되는 default 처리 프로파일 ID 를 반환한다.
 *
 * 단일 프로필이 파이프라인 전체에 적용되는 모델이므로, "이 파이프라인의 주력 처리 단계"
 * 를 기준으로 default 를 정한다. 매칭 없으면 첫 번째 프로파일.
 */
export function selectDefaultProfileId(
  profiles: ProcessingProfile[],
  steps: StepShape[],
): string | undefined {
  if (profiles.length === 0) return undefined;

  const inferred = inferPipelineProcessingStage(steps);
  if (inferred) {
    const match = profiles.find((p) => p.processingStage === inferred);
    if (match) return match.id;
  }

  return profiles[0]?.id;
}

/**
 * L1B sub-stage 순환 기본값.
 *
 * 한 파이프라인 안에서 여러 L1B 노드를 직렬로 사용할 때 (multi-look → speckle Lee → speckle Gamma-MAP → …),
 * 노드를 추가하는 시점의 인덱스에 따라 서로 다른 sub-stage 를 기본값으로 부여해 캔버스 라벨이 즉시
 * 구분되도록 한다. 인덱스가 시퀀스 길이를 넘으면 마지막 값을 재사용한다 — 사용자는 상세 모달에서 자유롭게 변경.
 */
const L1B_DEFAULT_SEQUENCE: SarSubStage[] = [
  { kind: 'multilook', rangeLooks: 4, azimuthLooks: 10 },
  { kind: 'speckle', filter: 'lee', winX: 5, winY: 5 },
  { kind: 'speckle', filter: 'gamma_map', winX: 5, winY: 5 },
  { kind: 'ground-range' },
  { kind: 'grd' },
];

export function defaultL1BSubStage(existingL1BCount: number): SarSubStage {
  const idx = Math.min(Math.max(existingL1BCount, 0), L1B_DEFAULT_SEQUENCE.length - 1);
  return L1B_DEFAULT_SEQUENCE[idx]!;
}
