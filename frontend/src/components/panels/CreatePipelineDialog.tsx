'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

const SATELLITE_IDS = ['KS-5', 'KS-6', 'KS-7'] as const;
const MODES = ['Stripmap', 'ScanSAR', 'Spotlight'] as const;

interface CreatePipelineDialogProps {
  onConfirm: (data: { name: string; satelliteId: string; mode: string }) => void;
  onCancel: () => void;
}

/** S-01: 파이프라인 생성 다이얼로그 — 이름 / 위성 / 모드 선택 */
export default function CreatePipelineDialog({ onConfirm, onCancel }: CreatePipelineDialogProps) {
  const [name, setName] = useState('');
  const [satelliteId, setSatelliteId] = useState<string>(SATELLITE_IDS[0]);
  const [mode, setMode] = useState<string>(MODES[0]);

  const isValid = name.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    onConfirm({ name: name.trim(), satelliteId, mode });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">새 파이프라인</h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="파이프라인 이름을 입력하세요"
              autoFocus
              className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">위성 ID</label>
            <select
              value={satelliteId}
              onChange={(e) => setSatelliteId(e.target.value)}
              className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {SATELLITE_IDS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">모드</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="text-[10px] text-muted-foreground">
              선택한 모드의 기본 스텝 구성이 자동 적용됩니다.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            생성
          </button>
        </div>
      </div>
    </div>
  );
}
