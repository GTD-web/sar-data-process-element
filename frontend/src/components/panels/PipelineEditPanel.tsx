'use client';

import { useState } from 'react';
import type { PipelineDefinition, TargetCsc, ProductLevel } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react';

const ALL_CSC: TargetCsc[] = ['CSC-02', 'CSC-03', 'CSC-04', 'CSC-05', 'CSC-06', 'CSC-07'];
const ALL_LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

interface PipelineEditPanelProps {
  pipeline: PipelineDefinition;
  onSave: (data: { name: string; satelliteId: string; mode: string; steps: { targetCsc: TargetCsc; productLevel: ProductLevel }[] }) => void;
  saving: boolean;
}

export default function PipelineEditPanel({ pipeline, onSave, saving }: PipelineEditPanelProps) {
  const [name, setName] = useState(pipeline.name);
  const [satellite, setSatellite] = useState(pipeline.satelliteId);
  const [mode, setMode] = useState(pipeline.mode);
  const [steps, setSteps] = useState(
    pipeline.steps.map((s) => ({ targetCsc: s.targetCsc, productLevel: s.productLevel })),
  );

  function addStep() {
    setSteps((prev) => [...prev, { targetCsc: 'CSC-03' as TargetCsc, productLevel: 'LEVEL_0' as ProductLevel }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: 'targetCsc' | 'productLevel', value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function moveStep(index: number, dir: -1 | 1) {
    const t = index + dir;
    if (t < 0 || t >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[t]] = [next[t], next[index]];
      return next;
    });
  }

  return (
    <div className="p-4 space-y-4">
      {/* Basic Info */}
      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-xs bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">위성 ID</label>
            <input
              value={satellite}
              onChange={(e) => setSatellite(e.target.value)}
              className="w-full text-xs bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">모드</label>
            <input
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full text-xs bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-muted-foreground">단계 ({steps.length})</span>
          <button
            onClick={addStep}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-medium hover:bg-accent/30 transition-colors"
          >
            <Plus className="w-3 h-3" />
            추가
          </button>
        </div>
        <div className="space-y-1.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-muted/30 rounded-md px-2 py-1.5">
              <div className="flex flex-col gap-0">
                <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-20">
                  <ArrowUp className="w-2.5 h-2.5 text-muted-foreground" />
                </button>
                <span className="text-[9px] font-mono text-muted-foreground text-center">{i + 1}</span>
                <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-0.5 disabled:opacity-20">
                  <ArrowDown className="w-2.5 h-2.5 text-muted-foreground" />
                </button>
              </div>
              <select
                value={step.targetCsc}
                onChange={(e) => updateStep(i, 'targetCsc', e.target.value)}
                className="flex-1 text-[11px] bg-card border border-border rounded px-1.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ALL_CSC.map((csc) => (
                  <option key={csc} value={csc}>{csc}</option>
                ))}
              </select>
              <select
                value={step.productLevel}
                onChange={(e) => updateStep(i, 'productLevel', e.target.value)}
                className="w-16 text-[11px] bg-card border border-border rounded px-1.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ALL_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>{PRODUCT_LEVEL_LABELS[lv]}</option>
                ))}
              </select>
              <button onClick={() => removeStep(i)} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={() => onSave({ name, satelliteId: satellite, mode, steps })}
        disabled={saving || steps.length === 0}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
      >
        <Save className="w-3.5 h-3.5" />
        {saving ? '저장 중...' : '저장'}
      </button>
    </div>
  );
}
