'use client';

import { useState } from 'react';
import { Antenna, FileInput, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileInputConfig, PipelineNodeKind, ProductLevel } from '@/types/pipeline';
import { PRODUCT_LEVEL_LABELS } from '@/types/pipeline';

interface FileInputConfigDialogProps {
  /** TRIGGER (raw data) 또는 FILE_INPUT (이미 처리된 결과 파일) */
  kind: 'TRIGGER' | 'FILE_INPUT';
  /** FILE_INPUT 일 때만 사용 — 어느 레벨의 결과 파일인지 표시. */
  inputLevel?: ProductLevel;
  current?: FileInputConfig;
  onConfirm: (config: FileInputConfig) => void;
  onCancel: () => void;
}

/**
 * 시작 노드(TRIGGER/FILE_INPUT) 입력 파일 지정 다이얼로그.
 * - TRIGGER  : 어떤 raw 데이터 파일을 이 파이프라인의 입력으로 흘려넣을 것인가 (EI-01)
 * - FILE_INPUT: 어떤 기존 처리 결과 파일을 입력으로 사용할 것인가 (SI-07, 부분 재처리)
 */
export default function FileInputConfigDialog({
  kind,
  inputLevel,
  current,
  onConfirm,
  onCancel,
}: FileInputConfigDialogProps) {
  const [sceneId, setSceneId] = useState(current?.sceneId ?? '');
  const [inputFilePath, setInputFilePath] = useState(current?.inputFilePath ?? '');

  const isValid = sceneId.trim().length > 0 && inputFilePath.trim().length > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({ sceneId: sceneId.trim(), inputFilePath: inputFilePath.trim() });
  };

  const isTrigger = kind === 'TRIGGER';
  const Icon = isTrigger ? Antenna : FileInput;
  const title = isTrigger ? 'Raw Data Input' : 'Result File Input';
  const badge = isTrigger ? 'RAW · EI-01' : `${inputLevel ? PRODUCT_LEVEL_LABELS[inputLevel] : 'L?'} · SI-07`;
  const description = isTrigger
    ? 'Pick the raw data file (CCSDS) this pipeline will process. The pipeline starts processing this file from L0.'
    : `Pick the existing ${inputLevel ? PRODUCT_LEVEL_LABELS[inputLevel] : 'processing result'} file this pipeline will start from. Subsequent stages run on top of this file.`;
  const pathLabel = isTrigger ? 'Raw Data Path' : 'Input File Path';
  const scenePlaceholder = isTrigger ? 'e.g. LX1-20260401-001' : 'e.g. SCENE-LX1-20260101-001';
  const pathPlaceholder = isTrigger
    ? 'e.g. /data/raw/lumirx-1/scene_xxx.bin'
    : 'e.g. /data/processed/l1/SCENE-LX1-20260101-001.h5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">{description}</p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Scene Identifier (Scene ID)</label>
            <input
              type="text"
              value={sceneId}
              onChange={(e) => setSceneId(e.target.value)}
              placeholder={scenePlaceholder}
              autoFocus
              className={cn(
                'w-full bg-muted border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1',
                sceneId.trim() ? 'border-accent/40 focus:ring-accent/50' : 'border-border focus:ring-accent/50',
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{pathLabel}</label>
            <input
              type="text"
              value={inputFilePath}
              onChange={(e) => setInputFilePath(e.target.value)}
              placeholder={pathPlaceholder}
              className={cn(
                'w-full bg-muted border rounded-md px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1',
                inputFilePath.trim() ? 'border-accent/40 focus:ring-accent/50' : 'border-border focus:ring-accent/50',
              )}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className={cn(
              'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
              isValid
                ? 'bg-accent text-accent-foreground hover:brightness-110'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// Re-export kind type alias for callers
export type FileInputDialogKind = Extract<PipelineNodeKind, 'TRIGGER' | 'FILE_INPUT'>;
