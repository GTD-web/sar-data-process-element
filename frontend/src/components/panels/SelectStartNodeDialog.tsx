'use client';

import { useState } from 'react';
import { ArrowLeft, Sparkles, Antenna, FileInput, Folder, GitBranch, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineNodeKind, ProductLevel, SarStage } from '@/types/pipeline';

export interface StartNodeSelection {
  startNodeKind: PipelineNodeKind;
  startNodeInputLevel?: ProductLevel;
  startNodeSarStage?: SarStage;
}

type StartNodeOption = {
  kind: PipelineNodeKind;
  inputLevel?: ProductLevel;
  sarStage?: SarStage;
  icon: React.ElementType;
  iconColor: string;
  borderActive: string;
  bgActive: string;
  badgeText: string;
  badgeColor: string;
  label: string;
  sublabel: string;
  description: string;
};

const OPTIONS: StartNodeOption[] = [
  {
    kind: 'TRIGGER',
    icon: Antenna,
    iconColor: 'text-emerald-400',
    borderActive: 'border-emerald-500/70',
    bgActive: 'bg-emerald-500/8',
    badgeText: 'Full Processing',
    badgeColor: 'bg-emerald-500/20 text-emerald-400',
    label: 'Raw Data Reception Trigger',
    sublabel: 'EI-01',
    description: 'Processes the entire L0 → L1 → L2 → L3 pipeline starting from raw data delivered by the ground station.',
  },
  {
    kind: 'SAR',
    sarStage: 'L0',
    icon: HardDrive,
    iconColor: 'text-cyan-400',
    borderActive: 'border-cyan-500/70',
    bgActive: 'bg-cyan-500/8',
    badgeText: 'Manual Start',
    badgeColor: 'bg-cyan-500/20 text-cyan-400',
    label: 'L0 Processing Node',
    sublabel: 'CSC-03',
    description: 'Starts the DAG directly from the L0 SAR processing node, without adding a raw-data trigger first.',
  },
  {
    kind: 'FILE_INPUT',
    inputLevel: 'LEVEL_1',
    icon: FileInput,
    iconColor: 'text-amber-400',
    borderActive: 'border-amber-500/70',
    bgActive: 'bg-amber-500/8',
    badgeText: 'Partial Reprocessing',
    badgeColor: 'bg-amber-500/20 text-amber-400',
    label: 'L1 Result Input',
    sublabel: 'SI-07',
    description: 'Takes existing L1 processing result files as input and reprocesses only the L2 → L3 segment.',
  },
  {
    kind: 'FILE_INPUT',
    inputLevel: 'LEVEL_2',
    icon: Folder,
    iconColor: 'text-sky-400',
    borderActive: 'border-sky-500/70',
    bgActive: 'bg-sky-500/8',
    badgeText: 'Partial Reprocessing',
    badgeColor: 'bg-sky-500/20 text-sky-400',
    label: 'L2 Result Input',
    sublabel: 'SI-07',
    description: 'Takes existing L2 processing result files as input and reprocesses only the L3 segment.',
  },
];

interface SelectStartNodeDialogProps {
  pipelineName: string;
  onConfirm: (selection: StartNodeSelection) => void;
  onBack: () => void;
  onCancel: () => void;
}

/** 파이프라인 생성 2단계 — 시작 노드 선택 */
export default function SelectStartNodeDialog({
  pipelineName,
  onConfirm,
  onBack,
  onCancel,
}: SelectStartNodeDialogProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const handleConfirm = () => {
    const opt = OPTIONS[selectedIdx];
    onConfirm({
      startNodeKind: opt.kind,
      startNodeInputLevel: opt.inputLevel,
      startNodeSarStage: opt.sarStage,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Select Start Node</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">2 / 2</span>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <span className="sr-only">Close</span>
            <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pipeline summary */}
        <div className="px-4 pt-3 pb-1">
          <div className="text-[11px] font-medium text-foreground truncate">{pipelineName}</div>
        </div>

        {/* Options */}
        <div className="max-h-[68vh] space-y-2 overflow-y-auto px-4 py-3">
          {OPTIONS.map((opt, idx) => {
            const Icon = opt.icon;
            const active = selectedIdx === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-150',
                  active
                    ? `${opt.borderActive} ${opt.bgActive}`
                    : 'border-border hover:border-border/80 hover:bg-muted/20',
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mt-0.5',
                    active ? 'bg-card/60' : 'bg-muted/50',
                  )}
                >
                  <Icon className={cn('w-5 h-5', active ? opt.iconColor : 'text-muted-foreground')} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn('text-xs font-semibold', active ? 'text-foreground' : 'text-foreground/80')}>
                      {opt.label}
                    </span>
                    <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full', opt.badgeColor)}>
                      {opt.badgeText}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-1">{opt.sublabel}</div>
                  <div className={cn('text-[11px] leading-relaxed', active ? 'text-muted-foreground' : 'text-muted-foreground/60')}>
                    {opt.description}
                  </div>
                </div>

                {/* Radio indicator */}
                <div className={cn('flex-shrink-0 w-4 h-4 rounded-full border-2 mt-1 flex items-center justify-center transition-all', active ? opt.borderActive : 'border-border')}>
                  {active && <div className={cn('w-1.5 h-1.5 rounded-full', opt.iconColor.replace('text-', 'bg-'))} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Create Pipeline
          </button>
        </div>
      </div>
    </div>
  );
}
