'use client';

import { useState } from 'react';
import type { PipelineDefinition } from '@/types/pipeline';
import { Save } from 'lucide-react';

const SATELLITES = ['Lumir-X1', 'Lumir-X2', 'Lumir-X3'];
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'];

interface PipelineEditPanelProps {
  pipeline: PipelineDefinition;
  onSave: (data: { name: string; satelliteId: string; mode: string }) => void;
  saving: boolean;
  onCancel?: () => void;
}

export default function PipelineEditPanel({ pipeline, onSave, saving, onCancel }: PipelineEditPanelProps) {
  const [name, setName] = useState(pipeline.name);
  const [satellite, setSatellite] = useState(pipeline.satelliteId);
  const [mode, setMode] = useState(pipeline.mode);

  const changed =
    name.trim() !== pipeline.name ||
    satellite !== pipeline.satelliteId ||
    mode !== pipeline.mode;
  const canSave = changed && name.trim().length > 0 && !saving;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">파이프라인 속성</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          운용 목록과 실행 Job에 표시되는 기본 정보를 수정합니다.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">이름</span>
          <input
            name="pipeline-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">위성</span>
          <select
            name="pipeline-satellite"
            value={satellite}
            onChange={(e) => setSatellite(e.target.value)}
            className="mt-1 w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {SATELLITES.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">촬영 모드</span>
          <select
            name="pipeline-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="mt-1 w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {MODES.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        노드와 엣지는 캔버스에서 직접 편집합니다. 속성 변경은 기존 DAG 구성을 유지합니다.
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            취소
          </button>
        )}
        <button
          type="button"
          onClick={() => onSave({ name: name.trim(), satelliteId: satellite, mode })}
          disabled={!canSave}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? '저장 중…' : '속성 저장'}
        </button>
      </div>
    </div>
  );
}
