'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';

export interface AddNodeButtonData {
  insertAfterOrder: number;
  onAdd: (afterOrder: number) => void;
  [key: string]: unknown;
}

function AddNodeButtonComponent({ data }: NodeProps) {
  const { insertAfterOrder, onAdd } = data as unknown as AddNodeButtonData;

  return (
    <div className="flex items-center" style={{ height: 32 }}>
      {/* Short connecting line */}
      <svg width="48" height="2" className="flex-shrink-0">
        <line x1="0" y1="1" x2="48" y2="1" stroke="#334155" strokeWidth="2" />
      </svg>
      {/* Plus button */}
      <button
        onClick={(e) => { e.stopPropagation(); onAdd(insertAfterOrder); }}
        className="w-7 h-7 rounded-full bg-card border-2 border-border flex items-center justify-center hover:border-accent hover:bg-accent/10 transition-all flex-shrink-0"
      >
        <Plus className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

export const AddNodeButton = memo(AddNodeButtonComponent);
