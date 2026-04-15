'use client';

import { useState } from 'react';
import { FileInput, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileInputConfig, ProductLevel } from '@/types/pipeline';
import { PRODUCT_LEVEL_LABELS } from '@/types/pipeline';

interface FileInputConfigDialogProps {
  inputLevel: ProductLevel;
  current?: FileInputConfig;
  onConfirm: (config: FileInputConfig) => void;
  onCancel: () => void;
}

/** FILE_INPUT 노드 설정 다이얼로그 — 부분 재처리 입력 파일 지정 (SI-07) */
export default function FileInputConfigDialog({
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FileInput className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">결과 입력 설정</h2>
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              {PRODUCT_LEVEL_LABELS[inputLevel]} · SI-07
            </span>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            파이프라인에 입력할 기존 처리 결과 파일을 지정합니다. 지정된 파일부터 이후 처리 단계가 시작됩니다.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">씬 식별자 (Scene ID)</label>
            <input
              type="text"
              value={sceneId}
              onChange={(e) => setSceneId(e.target.value)}
              placeholder="예: SCENE-KS5-20260101-001"
              autoFocus
              className={cn(
                'w-full bg-muted border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1',
                sceneId.trim() ? 'border-accent/40 focus:ring-accent/50' : 'border-border focus:ring-accent/50',
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">입력 파일 경로</label>
            <input
              type="text"
              value={inputFilePath}
              onChange={(e) => setInputFilePath(e.target.value)}
              placeholder="예: /data/processed/l1/SCENE-KS5-20260101-001.h5"
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
            취소
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
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
