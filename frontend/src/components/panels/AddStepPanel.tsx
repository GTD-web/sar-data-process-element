'use client';

import type { SarStage, PipelineNodeKind } from '@/types/pipeline';
import { SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_TO_LEVEL, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { HardDrive, Cpu, Layers, Compass, Map, Crosshair, Package, Database } from 'lucide-react';

interface SarStageOption {
  kind: 'SAR';
  sarStage: SarStage;
  icon: React.ElementType;
}

interface CatalogOption {
  kind: 'CATALOG';
  icon: React.ElementType;
}

type StepOption = SarStageOption | CatalogOption;

const STEP_OPTIONS: StepOption[] = [
  { kind: 'SAR', sarStage: 'L0', icon: HardDrive },
  { kind: 'SAR', sarStage: 'L1A', icon: Cpu },
  { kind: 'SAR', sarStage: 'L1B', icon: Layers },
  { kind: 'SAR', sarStage: 'L1C', icon: Compass },
  { kind: 'SAR', sarStage: 'L2A', icon: Map },
  { kind: 'SAR', sarStage: 'L2B', icon: Crosshair },
  { kind: 'SAR', sarStage: 'L3', icon: Package },
  { kind: 'CATALOG', icon: Database },
];

interface AddStepPanelProps {
  insertAfterOrder: number;
  insertBeforeOrder?: number;
  onSelect: (afterOrder: number, kind: PipelineNodeKind, sarStage?: SarStage) => void;
}

export default function AddStepPanel({ insertAfterOrder, insertBeforeOrder, onSelect }: AddStepPanelProps) {
  const description = insertBeforeOrder !== undefined
    ? `단계 #${insertAfterOrder}과 #${insertBeforeOrder} 사이에 추가할 단계를 선택하세요.`
    : insertAfterOrder === 0
      ? '파이프라인 맨 앞에 추가할 단계를 선택하세요.'
      : `단계 #${insertAfterOrder} 뒤에 추가할 단계를 선택하세요.`;

  return (
    <div className="p-4 space-y-3">
      <div className="text-xs text-muted-foreground">
        {description}
      </div>

      <div className="space-y-2">
        {STEP_OPTIONS.map((opt) => {
          const Icon = opt.icon;

          if (opt.kind === 'CATALOG') {
            return (
              <button
                key="CATALOG"
                onClick={() => onSelect(insertAfterOrder, 'CATALOG')}
                className="w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all hover:scale-[1.01] active:scale-[0.99] bg-muted/30 border-border"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 flex-shrink-0 text-foreground">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">CATALOG</span>
                    <span className="text-[10px] font-mono text-muted-foreground">CSC-07</span>
                  </div>
                  <div className="text-xs text-foreground/80">카탈로그 등록</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">산출물을 카탈로그에 등록합니다</div>
                </div>
              </button>
            );
          }

          const tasks = SAR_STAGE_TASKS[opt.sarStage];
          const level = PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[opt.sarStage]];

          return (
            <button
              key={opt.sarStage}
              onClick={() => onSelect(insertAfterOrder, 'SAR', opt.sarStage)}
              className="w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all hover:scale-[1.01] active:scale-[0.99] bg-muted/30 border-border"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 flex-shrink-0 text-foreground">
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{opt.sarStage}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{level}</span>
                </div>
                <div className="text-xs text-foreground/80">{SAR_STAGE_LABELS[opt.sarStage]}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {tasks.slice(0, 3).join(' · ')}
                  {tasks.length > 3 && ` +${tasks.length - 3}`}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
