'use client';

import type { SarStage, PipelineNodeKind } from '@/types/pipeline';
import { SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_TO_LEVEL, SAR_STAGE_DESCRIPTIONS, NODE_KIND_INFO, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { HardDrive, Cpu, Layers, Compass, Map, Crosshair, Package, Database, SlidersHorizontal, Image as ImageIcon } from 'lucide-react';

interface SarStageOption {
  kind: 'SAR';
  sarStage: SarStage;
  icon: React.ElementType;
}

interface FixedKindOption {
  kind: 'CATALOG' | 'JOB_INIT' | 'THUMBNAIL';
  icon: React.ElementType;
  label: string;
  csc: string;
}

type StepOption = SarStageOption | FixedKindOption;

const STEP_OPTIONS: StepOption[] = [
  { kind: 'JOB_INIT', icon: SlidersHorizontal, label: 'Job Initialization', csc: 'CSU-08.02' },
  { kind: 'SAR', sarStage: 'L0', icon: HardDrive },
  { kind: 'SAR', sarStage: 'L1A', icon: Cpu },
  { kind: 'SAR', sarStage: 'L1B', icon: Layers },
  { kind: 'SAR', sarStage: 'L1C', icon: Compass },
  { kind: 'SAR', sarStage: 'L2A', icon: Map },
  { kind: 'SAR', sarStage: 'L2B', icon: Crosshair },
  { kind: 'SAR', sarStage: 'L3', icon: Package },
  { kind: 'THUMBNAIL', icon: ImageIcon, label: 'Quick-look Generation', csc: 'CSU-07.06' },
  { kind: 'CATALOG', icon: Database, label: 'Catalog Registration', csc: 'CSC-07' },
];

interface AddStepPanelProps {
  insertAfterOrder: number;
  insertBeforeOrder?: number;
  asSeparateStart?: boolean;
  onSelect: (afterOrder: number, kind: PipelineNodeKind, sarStage?: SarStage) => void;
}

export default function AddStepPanel({ insertAfterOrder, insertBeforeOrder, asSeparateStart, onSelect }: AddStepPanelProps) {
  const description = asSeparateStart
    ? 'Select a new start node that is not connected to the existing DAG.'
    : insertBeforeOrder !== undefined
    ? `Select a step to insert between #${insertAfterOrder} and #${insertBeforeOrder}.`
    : insertAfterOrder === 0
      ? 'Select a step to add at the start of the pipeline.'
      : `Select a step to add after #${insertAfterOrder}.`;

  return (
    <div className="p-4 space-y-3">
      <div className="text-xs text-muted-foreground">
        {description}
      </div>

      <div className="space-y-2">
        {STEP_OPTIONS.map((opt) => {
          const Icon = opt.icon;

          if (opt.kind === 'SAR') {
            const tasks = SAR_STAGE_TASKS[opt.sarStage];
            const level = PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[opt.sarStage]];
            const desc = SAR_STAGE_DESCRIPTIONS[opt.sarStage];

            return (
              <button
                key={opt.sarStage}
                onClick={() => onSelect(insertAfterOrder, 'SAR', opt.sarStage)}
                className="w-full flex items-start gap-3 p-3 rounded-lg border text-left bg-muted/30 border-border hover:bg-muted/50 hover:border-accent/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 shrink-0 text-foreground">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{opt.sarStage}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{level}</span>
                  </div>
                  <div className="text-xs text-foreground/80">{SAR_STAGE_LABELS[opt.sarStage]}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                    {tasks.slice(0, 3).join(' · ')}
                    {tasks.length > 3 && ` +${tasks.length - 3}`}
                  </div>
                </div>
              </button>
            );
          }

          const kindInfo = NODE_KIND_INFO[opt.kind];
          return (
            <button
              key={opt.kind}
              onClick={() => onSelect(insertAfterOrder, opt.kind)}
              className="w-full flex items-start gap-3 p-3 rounded-lg border text-left bg-muted/30 border-border hover:bg-muted/50 hover:border-accent/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 shrink-0 text-foreground">
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{opt.csc}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{kindInfo?.description}</div>
                {kindInfo && (
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                    {kindInfo.processes.slice(0, 3).join(' · ')}
                    {kindInfo.processes.length > 3 && ` +${kindInfo.processes.length - 3}`}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
