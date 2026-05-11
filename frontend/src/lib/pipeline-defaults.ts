import type { PipelineNodeKind, ProcessingProfile, ProductLevel, SarStage } from '@/types/pipeline';

interface StepShape {
  kind: PipelineNodeKind;
  sarStage?: SarStage;
  inputLevel?: ProductLevel;
}

/**
 * 시작 노드 / 첫 SAR 단계에 매칭되는 default 처리 프로파일 ID 를 반환한다.
 *
 * 단일 프로필이 파이프라인 전체에 적용되는 모델이므로, "이 파이프라인의 주력 처리 단계"
 * 를 기준으로 default 를 정한다.
 *
 * 우선순위:
 *  1. 첫 SAR 노드의 sarStage → 그 stage 를 processingStage 로 갖는 프로파일
 *  2. SAR 노드가 없을 때 (등록만 하는 케이스) — 시작 노드 종류로 추정:
 *     - TRIGGER             → L0
 *     - FILE_INPUT LEVEL_0  → L1A
 *     - FILE_INPUT LEVEL_1  → L2A
 *     - FILE_INPUT LEVEL_2  → L3
 *  3. 매칭이 없으면 첫 번째 프로파일
 */
export function selectDefaultProfileId(
  profiles: ProcessingProfile[],
  steps: StepShape[],
): string | undefined {
  if (profiles.length === 0) return undefined;

  const firstSar = steps.find((s) => s.kind === 'SAR');
  if (firstSar?.sarStage) {
    const match = profiles.find((p) => p.processingStage === firstSar.sarStage);
    if (match) return match.id;
  }

  const start = steps[0];
  let inferredStage: string | undefined;
  if (start?.kind === 'TRIGGER') {
    inferredStage = 'L0';
  } else if (start?.kind === 'FILE_INPUT') {
    inferredStage =
      start.inputLevel === 'LEVEL_0'
        ? 'L1A'
        : start.inputLevel === 'LEVEL_1'
          ? 'L2A'
          : start.inputLevel === 'LEVEL_2'
            ? 'L3'
            : undefined;
  }
  if (inferredStage) {
    const match = profiles.find((p) => p.processingStage === inferredStage);
    if (match) return match.id;
  }

  return profiles[0]?.id;
}
