'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CustomSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

interface CustomSelectProps<T extends string = string> {
  value: T;
  options: CustomSelectOption<T>[];
  onChange: (next: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** 드롭다운 패널 너비를 부모 폭에 맞추지 않고 자동으로 늘리고 싶을 때 사용. 기본은 부모 폭. */
  panelClassName?: string;
}

/**
 * Native `<select>` 대비 즉시 열리는 가벼운 커스텀 select.
 * - 클릭/Enter/Space로 열고, ↑↓로 이동, Enter로 선택, Esc로 닫기.
 * - 포털 없이 absolute 포지셔닝 — 모달 안에서 그대로 동작.
 */
export default function CustomSelect<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className,
  panelClassName,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) closeAndReset();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeAndReset();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closeAndReset]);

  // 열릴 때 현재 선택 항목으로 highlight 초기화
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlight(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && highlight < options.length) {
        onChange(options[highlight].value);
        closeAndReset();
      }
    }
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleButtonKeyDown}
        className={cn(
          'w-full flex items-center justify-between gap-2 bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground',
          'focus:outline-none focus:ring-1 focus:ring-accent/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          open && 'ring-1 ring-accent/50',
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground/60')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <ul
          ref={listRef}
          tabIndex={-1}
          role="listbox"
          onKeyDown={handleListKeyDown}
          className={cn(
            'absolute z-30 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-card shadow-lg',
            'py-1 outline-none',
            panelClassName,
          )}
        >
          {options.length === 0 && (
            <li className="px-2.5 py-1.5 text-[11px] text-muted-foreground/60">No options</li>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isHighlighted = i === highlight;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => { onChange(opt.value); closeAndReset(); }}
                className={cn(
                  'flex items-start gap-2 px-2.5 py-1.5 text-xs cursor-pointer',
                  isHighlighted ? 'bg-accent/15' : '',
                  isSelected ? 'text-accent' : 'text-foreground',
                )}
              >
                <span className="w-3.5 h-3.5 mt-0.5 shrink-0 flex items-center justify-center">
                  {isSelected && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{opt.label}</span>
                  {opt.description && (
                    <span className="block text-[10px] text-muted-foreground/70 truncate">{opt.description}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
