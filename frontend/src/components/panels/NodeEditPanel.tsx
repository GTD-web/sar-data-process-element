'use client';

import { useState, useEffect } from 'react';
import type { TargetCsc, ProductLevel, PipelineStepDefinition } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { Save, Trash2 } from 'lucide-react';

const ALL_CSC: TargetCsc[] = ['CSC-02', 'CSC-03', 'CSC-04', 'CSC-05', 'CSC-06', 'CSC-07'];
const ALL_LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

interface NodeEditPanelProps {
  step: PipelineStepDefinition;
  onSave: (step: PipelineStepDefinition) => void;
  onDelete: () => void;
}

export default function NodeEditPanel({ step, onSave, onDelete }: NodeEditPanelProps) {
  const [csc, setCsc] = useState<TargetCsc>(step.targetCsc);
  const [level, setLevel] = useState<ProductLevel>(step.productLevel);

  useEffect(() => {
    setCsc(step.targetCsc);
    setLevel(step.productLevel);
  }, [step]);

  const changed = csc !== step.targetCsc || level !== step.productLevel;

  return (
    <div className="p-4 space-y-4">
      <div className="text-xs text-muted-foreground">
        단계 #{step.order} 속성을 편집합니다.
      </div>

      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">대상 CSC</label>
        <div className="space-y-1">
          {ALL_CSC.map((c) => (
            <button
              key={c}
              onClick={() => setCsc(c)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                csc === c
                  ? 'bg-accent/15 border border-accent/50 text-accent'
                  : 'bg-muted/30 border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <div className="font-semibold">{c}</div>
              <div className="text-[10px] opacity-70">{CSC_LABELS[c]}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">산출물 레벨</label>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                level === lv
                  ? 'bg-accent/15 border border-accent/50 text-accent'
                  : 'bg-muted/30 border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              {PRODUCT_LEVEL_LABELS[lv]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          onClick={() => onSave({ order: step.order, targetCsc: csc, productLevel: level })}
          disabled={!changed}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-30 transition-colors"
        >
          <Save className="w-3 h-3" />
          적용
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          삭제
        </button>
      </div>
    </div>
  );
}
