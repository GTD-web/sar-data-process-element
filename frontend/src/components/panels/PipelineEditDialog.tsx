'use client';

import { X } from 'lucide-react';
import type { PipelineDefinition } from '@/types/pipeline';
import PipelineEditPanel from './PipelineEditPanel';

interface PipelineEditDialogProps {
  pipeline: PipelineDefinition;
  saving: boolean;
  onSave: (data: { name: string; satelliteId: string; mode: string }) => void;
  onCancel: () => void;
}

export default function PipelineEditDialog({ pipeline, saving, onSave, onCancel }: PipelineEditDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">파이프라인 속성 수정</h2>
          <button type="button" onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <PipelineEditPanel
          pipeline={pipeline}
          saving={saving}
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
