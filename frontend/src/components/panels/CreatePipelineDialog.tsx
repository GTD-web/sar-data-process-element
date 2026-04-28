'use client';

import { useState } from 'react';
import { Plus, X, ArrowRight } from 'lucide-react';

export interface CreatePipelineBasicData {
  name: string;
}

interface CreatePipelineDialogProps {
  onNext: (data: CreatePipelineBasicData) => void;
  onCancel: () => void;
}

/** 파이프라인 생성 1단계 — 이름 입력. 매칭 태그는 JOB_INIT의 처리 프로파일에서 파생되므로 이 단계에서는 받지 않는다. */
export default function CreatePipelineDialog({ onNext, onCancel }: CreatePipelineDialogProps) {
  const [name, setName] = useState('');
  const isValid = name.trim().length > 0;

  const handleNext = () => {
    if (!isValid) return;
    onNext({ name: name.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">새 파이프라인</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">1 / 2</span>
          </div>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNext()}
              placeholder="파이프라인 이름을 입력하세요"
              autoFocus
              className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            매칭 위성/모드/편파 태그는 파이프라인의 JOB_INIT 노드에서 선택한 처리 프로파일을 따릅니다.
          </p>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleNext}
            disabled={!isValid}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            다음
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
