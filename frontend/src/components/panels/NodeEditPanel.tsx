'use client';

import { useState, useEffect } from 'react';
import type { SarStage, PipelineNodeKind, PipelineStepDefinition } from '@/types/pipeline';
import { SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_TO_LEVEL, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { Save, Trash2 } from 'lucide-react';
import { HardDrive, Cpu, Layers, Compass, Map, Crosshair, Package, Database } from 'lucide-react';

const SAR_STAGES: SarStage[] = ['L0', 'L1A', 'L1B', 'L1C', 'L2A', 'L2B', 'L3'];

const SAR_STAGE_ICONS: Record<SarStage, React.ElementType> = {
  L0: HardDrive,
  L1A: Cpu,
  L1B: Layers,
  L1C: Compass,
  L2A: Map,
  L2B: Crosshair,
  L3: Package,
};

interface NodeEditPanelProps {
  step: PipelineStepDefinition;
  onSave: (step: PipelineStepDefinition) => void;
  onDelete: () => void;
}

export default function NodeEditPanel({ step, onSave, onDelete }: NodeEditPanelProps) {
  const [kind, setKind] = useState<PipelineNodeKind>(step.kind);
  const [sarStage, setSarStage] = useState<SarStage | undefined>(step.sarStage);

  useEffect(() => {
    setKind(step.kind);
    setSarStage(step.sarStage);
  }, [step]);

  const changed = kind !== step.kind || sarStage !== step.sarStage;

  if (step.kind === 'TRIGGER') {
    return (
      <div className="p-4 space-y-3">
        <div className="text-xs text-muted-foreground">TRIGGER 노드는 편집할 수 없습니다.</div>
        <div className="bg-muted/30 rounded-md p-3 text-[11px] text-muted-foreground">
          EI-01 RAW_DATA_RECEIVED 이벤트를 수신하면 파이프라인이 시작됩니다. 이 노드는 항상 파이프라인의 진입점입니다.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-xs text-muted-foreground">
        단계 #{step.order} 속성을 편집합니다.
      </div>

      {/* Kind selector */}
      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">노드 유형</label>
        <div className="flex gap-1.5">
          <button
            onClick={() => { setKind('SAR'); setSarStage(sarStage ?? 'L0'); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              kind === 'SAR'
                ? 'bg-accent/15 border border-accent/50 text-accent'
                : 'bg-muted/30 border border-transparent text-muted-foreground hover:bg-muted/50'
            }`}
          >
            SAR 처리
          </button>
          <button
            onClick={() => { setKind('CATALOG'); setSarStage(undefined); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              kind === 'CATALOG'
                ? 'bg-accent/15 border border-accent/50 text-accent'
                : 'bg-muted/30 border border-transparent text-muted-foreground hover:bg-muted/50'
            }`}
          >
            카탈로그 등록
          </button>
        </div>
      </div>

      {/* SAR stage selector */}
      {kind === 'SAR' && (
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">처리 스테이지</label>
          <div className="space-y-1">
            {SAR_STAGES.map((s) => {
              const Icon = SAR_STAGE_ICONS[s];
              const tasks = SAR_STAGE_TASKS[s];
              const level = PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[s]];
              const isSelected = sarStage === s;
              return (
                <button
                  key={s}
                  onClick={() => setSarStage(s)}
                  className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-accent/15 border border-accent/50 text-accent'
                      : 'bg-muted/30 border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{s}</span>
                      <span className="text-[10px] font-mono opacity-70">{level}</span>
                    </div>
                    <div className="text-[10px] opacity-70 truncate">{SAR_STAGE_LABELS[s]}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CATALOG info */}
      {kind === 'CATALOG' && (
        <div className="bg-muted/30 rounded-md p-3 flex items-start gap-2">
          <Database className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted-foreground">
            CSC-07이 산출물을 카탈로그에 등록합니다. 재처리 완료 후 최신 버전이 PUBLISHED 상태로 전환됩니다.
          </div>
        </div>
      )}

      {/* Selected stage tasks */}
      {kind === 'SAR' && sarStage && (
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">처리 항목 ({SAR_STAGE_TASKS[sarStage].length})</label>
          <div className="space-y-0.5">
            {SAR_STAGE_TASKS[sarStage].map((task) => (
              <div key={task} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-1 h-1 rounded-full bg-accent/50 flex-shrink-0" />
                {task}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          onClick={() => onSave({ order: step.order, kind, sarStage })}
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
