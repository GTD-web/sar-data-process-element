'use client';

import { useState, useEffect } from 'react';
import { Layers, ArrowRight } from 'lucide-react';
import type { PipelineStepDefinition, SarSubStage, SpeckleFilter } from '@/types/pipeline';
import { SPECKLE_FILTER_LABELS, subStageLabel, subStageCsu } from '@/types/pipeline';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';
import { toast } from '@/components/ui/Toast';

interface L1BSubStageEditorProps {
  step: PipelineStepDefinition;
  onSave: (next: PipelineStepDefinition) => void;
}

type SubStageKind = SarSubStage['kind'];

const KIND_OPTIONS: CustomSelectOption<SubStageKind>[] = [
  { value: 'multilook', label: 'Multi-look (CSU-04.05)', description: 'Range × azimuth multi-looking — MLC product' },
  { value: 'speckle', label: 'Speckle filter (CSU-04.06)', description: 'Stochastic noise reduction with a chosen window' },
  { value: 'ground-range', label: 'Ground-range projection (CSU-04.07)', description: 'Slant → ground range conversion' },
  { value: 'grd', label: 'GRD product (CSU-04.08)', description: 'Detected ground-range product' },
];

const FILTER_OPTIONS: CustomSelectOption<SpeckleFilter>[] = (Object.keys(SPECKLE_FILTER_LABELS) as SpeckleFilter[]).map((f) => ({
  value: f,
  label: SPECKLE_FILTER_LABELS[f],
}));

const DEFAULT_BY_KIND: Record<SubStageKind, SarSubStage> = {
  multilook: { kind: 'multilook', rangeLooks: 4, azimuthLooks: 10 },
  speckle: { kind: 'speckle', filter: 'lee', winX: 5, winY: 5 },
  'ground-range': { kind: 'ground-range' },
  grd: { kind: 'grd' },
};

/**
 * L1B 한 단계 안에서 어떤 sub-stage(필터)를 실행할지 고른다.
 *
 * 동작 원칙 — 라이브 적용:
 * - Kind / Filter / 숫자 파라미터를 바꿀 때마다 즉시 `onSave` 가 호출돼
 *   상위 step 의 `sarSubStage` 가 갱신된다. 사용자가 별도 Apply 를 누를 필요 없음.
 * - Kind 가 바뀌면 알고리즘 자체가 달라지므로 `code/codeLanguage/codeFilename`
 *   을 비워 NodeCodeEditorPanel 이 새 sub-stage 의 native 소스를 다시 fetch 하도록 한다
 *   (04.05/04.06 은 실제 코드, 04.07/04.08 은 mock fallback).
 * - 같은 Kind 안에서 파라미터(필터 종류·window·looks) 만 바뀐 경우엔 코드는 그대로 두고
 *   `sarSubStage` 만 업데이트한다 — 사용자가 편집했을 수 있는 step.code 가 날아가지 않도록.
 */
export default function L1BSubStageEditor({ step, onSave }: L1BSubStageEditorProps) {
  const initial: SarSubStage = step.sarSubStage ?? DEFAULT_BY_KIND.multilook;
  const [draft, setDraft] = useState<SarSubStage>(initial);

  // 외부에서 step 이 바뀌면 (다른 노드 열림 등) draft 도 동기화.
  useEffect(() => {
    setDraft(step.sarSubStage ?? DEFAULT_BY_KIND.multilook);
  }, [step.sarSubStage, step.order]);

  /** Kind 가 바뀐 경우 — code 도 비워 새 sub-stage 의 native 가 다시 fetch 되도록. */
  const commitKind = (next: SubStageKind) => {
    if (next === draft.kind) return;
    const prevCsu = subStageCsu(draft);
    const nextSubStage = DEFAULT_BY_KIND[next];
    const nextCsu = subStageCsu(nextSubStage);
    const nextLabel = subStageLabel(nextSubStage);
    setDraft(nextSubStage);
    onSave({
      ...step,
      sarSubStage: nextSubStage,
      code: undefined,
      codeLanguage: undefined,
      codeFilename: undefined,
    });
    toast.custom(
      (id) => (
        <div
          className="kind-change-toast flex items-center gap-2.5 rounded-lg border border-accent/40 bg-card px-3.5 py-2.5 shadow-xl"
          data-testid="l1b-kind-toast"
          onClick={() => toast.dismiss(id)}
          role="status"
        >
          <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-muted-foreground">{prevCsu}</span>
              <ArrowRight className="w-3 h-3 text-accent" />
              <span className="font-semibold text-foreground">{nextCsu}</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              Switched to {nextLabel}. Code & Tasks refreshed.
            </div>
          </div>
        </div>
      ),
      { duration: 2400, id: `l1b-kind-${step.order}`, unstyled: true },
    );
  };

  /** 같은 Kind 안에서 파라미터만 바뀐 경우 — sarSubStage 만 갱신, 코드 보존. */
  const commitParams = (next: SarSubStage) => {
    setDraft(next);
    onSave({ ...step, sarSubStage: next });
  };

  return (
    <div className="px-5 py-4 space-y-3 border-b border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-accent" />
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            L1B Sub-stage
          </div>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">{subStageCsu(draft)}</span>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground/70">
        Each L1B sub-stage performs a different operation. Changing Kind immediately swaps the
        node&apos;s code (CODE section) and Tasks to match that CSU. CSU-04.05 / 04.06 run the real
        native code, while 04.07 / 04.08 fall back to mock code and mock execution since the
        backend is not yet implemented.
      </p>

      <div className="space-y-2">
        <label className="block text-[11px] text-muted-foreground">Kind</label>
        <CustomSelect<SubStageKind>
          value={draft.kind}
          options={KIND_OPTIONS}
          onChange={commitKind}
        />
      </div>

      {draft.kind === 'multilook' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground">Range looks</label>
            <input
              type="number"
              min={1}
              max={64}
              value={draft.rangeLooks ?? 4}
              onChange={(e) => commitParams({ ...draft, rangeLooks: Number(e.target.value) || 1 })}
              className="w-full h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-accent focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground">Azimuth looks</label>
            <input
              type="number"
              min={1}
              max={64}
              value={draft.azimuthLooks ?? 10}
              onChange={(e) => commitParams({ ...draft, azimuthLooks: Number(e.target.value) || 1 })}
              className="w-full h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      )}

      {draft.kind === 'speckle' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground">Filter</label>
            <CustomSelect<SpeckleFilter>
              value={draft.filter}
              options={FILTER_OPTIONS}
              onChange={(next) => commitParams({ ...draft, filter: next })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-[11px] text-muted-foreground">Window X</label>
              <input
                type="number"
                min={3}
                max={21}
                step={2}
                value={draft.winX ?? 5}
                onChange={(e) => commitParams({ ...draft, winX: Number(e.target.value) || 3 })}
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-accent focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] text-muted-foreground">Window Y</label>
              <input
                type="number"
                min={3}
                max={21}
                step={2}
                value={draft.winY ?? 5}
                onChange={(e) => commitParams({ ...draft, winY: Number(e.target.value) || 3 })}
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {(draft.kind === 'ground-range' || draft.kind === 'grd') && (
        <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2 text-[10px] text-muted-foreground">
          This sub-stage takes no additional parameters — the output is fully determined by the
          input (SLC/MLC from the previous node).
        </div>
      )}

      <div className="text-[10px] text-muted-foreground">
        Canvas label →{' '}
        <span className="font-semibold text-foreground" data-testid="l1b-substage-preview">
          {subStageLabel(draft)}
        </span>
      </div>
    </div>
  );
}
