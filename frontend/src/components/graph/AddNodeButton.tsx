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
    <button
      onClick={(e) => { e.stopPropagation(); onAdd(insertAfterOrder); }}
      className="add-node-trigger w-7 h-7 rounded-full bg-card/80 border-2 border-dashed border-border flex items-center justify-center hover:border-accent hover:bg-accent/10 transition-all"
    >
      <Plus className="w-3.5 h-3.5 text-muted-foreground" />
    </button>
  );
}

export const AddNodeButton = memo(AddNodeButtonComponent);
