'use client';

import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export default function RightPanel({ open, onClose, title, children, width = 'w-96' }: RightPanelProps) {
  return (
    <div
      className={cn(
        'absolute top-0 right-0 h-full bg-card border-l border-border shadow-2xl transition-transform duration-200 z-20 flex flex-col',
        width,
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted/50 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
