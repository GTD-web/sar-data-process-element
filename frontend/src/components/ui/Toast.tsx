'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  message: string;
  type: 'error' | 'success' | 'info';
}

interface ToastProps extends ToastMessage {
  onDismiss: () => void;
}

const ICON_MAP = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
};

const STYLE_MAP = {
  error: 'bg-card border-destructive/40 text-destructive',
  success: 'bg-card border-success/40 text-success',
  info: 'bg-card border-accent/40 text-accent',
};

export default function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const Icon = ICON_MAP[type];

  return (
    <div
      className={cn(
        'fixed bottom-5 right-5 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-lg border shadow-xl max-w-sm animate-in fade-in slide-in-from-bottom-2',
        STYLE_MAP[type],
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <p className="text-xs flex-1 text-foreground">{message}</p>
      <button onClick={onDismiss} className="p-0.5 rounded hover:opacity-60 transition-opacity ml-1">
        <X className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
