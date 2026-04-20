'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ExecutionLog, LogLevel } from '@/types/pipeline';
import {
  ChevronUp,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  Info,
  Search,
  Trash2,
  ArrowDownToLine,
} from 'lucide-react';

const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 720;
const DEFAULT_PANEL_HEIGHT = 240;
const COLLAPSED_HEIGHT = 32;

interface ExecutionLogPanelProps {
  logs: ExecutionLog[];
  selectedJobId?: string | null;
  open: boolean;
  onToggle: () => void;
}

const LEVEL_CONFIG: Record<LogLevel, { icon: React.ElementType; color: string; bg: string }> = {
  ERROR: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  WARN: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  INFO: { icon: Info, color: 'text-muted-foreground', bg: 'bg-transparent' },
};

type LevelFilter = 'ALL' | LogLevel;

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function clampHeight(px: number): number {
  if (typeof window === 'undefined') {
    return Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, px));
  }
  const cap = Math.min(MAX_PANEL_HEIGHT, Math.floor(window.innerHeight * 0.72));
  return Math.max(MIN_PANEL_HEIGHT, Math.min(cap, px));
}

export default function ExecutionLogPanel({ logs, selectedJobId, open, onToggle }: ExecutionLogPanelProps) {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Job 선택 시 자동으로 해당 Job 로그 필터 활성화
  const jobFilter = !!selectedJobId;

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (jobFilter && selectedJobId) {
      result = result.filter((l) => l.jobId === selectedJobId);
    }
    if (levelFilter !== 'ALL') {
      result = result.filter((l) => l.level === levelFilter);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (l) => l.message.toLowerCase().includes(lower) || l.source.toLowerCase().includes(lower) || l.jobId?.toLowerCase().includes(lower),
      );
    }
    return result;
  }, [logs, levelFilter, searchTerm, jobFilter, selectedJobId]);

  // Job 필터 적용된 로그 기준으로 ERROR/WARN 카운트
  const baseLogs = useMemo(() => {
    if (jobFilter && selectedJobId) {
      return logs.filter((l) => l.jobId === selectedJobId);
    }
    return logs;
  }, [logs, jobFilter, selectedJobId]);
  const errorCount = useMemo(() => baseLogs.filter((l) => l.level === 'ERROR').length, [baseLogs]);
  const warnCount = useMemo(() => baseLogs.filter((l) => l.level === 'WARN').length, [baseLogs]);

  useEffect(() => {
    if (autoScroll && open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll, open]);

  useEffect(() => {
    const onResize = () => setPanelHeight((h) => clampHeight(h));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    if (!open) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startY = e.clientY;
    const startH = panelHeight;

    const onMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY;
      setPanelHeight(clampHeight(startH + delta));
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [open, panelHeight]);

  const outerHeight = open ? panelHeight : COLLAPSED_HEIGHT;

  return (
    <div
      className={cn(
        'flex flex-col bg-card border-t border-border shrink-0',
        !isResizing && 'transition-[height] duration-200 ease-out',
      )}
      style={{ height: outerHeight }}
    >
      {/* Resize grip — top edge of expanded panel */}
      {open && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={panelHeight}
          aria-valuemin={MIN_PANEL_HEIGHT}
          aria-valuemax={MAX_PANEL_HEIGHT}
          aria-label="실행 로그 패널 높이 조절"
          onPointerDown={handleResizePointerDown}
          className={cn(
            'h-2 shrink-0 cursor-ns-resize flex flex-col items-center justify-center border-b border-border/80',
            'bg-muted/30 hover:bg-muted/60 active:bg-muted/80 touch-none select-none',
            isResizing && 'bg-accent/20',
          )}
        >
          <div className="h-0.5 w-9 rounded-full bg-muted-foreground/35" />
        </div>
      )}

      {/* Header Bar — 바(빈 영역·제목·chevron) 클릭 시 접기/펼치기, 필터·검색·도구는 별도 동작 */}
      <div
        className="flex items-center gap-0 shrink-0 h-8 border-b border-border px-1 cursor-pointer"
        onClick={() => onToggle()}
        role="presentation"
      >
        <span className="p-1 mr-1 shrink-0 rounded pointer-events-none">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
        </span>

        <span className="text-[11px] font-semibold text-foreground mr-3 select-none shrink-0 pointer-events-none">실행 로그</span>

        {(['ALL', 'ERROR', 'WARN', 'INFO'] as const).map((level) => (
          <button
            key={level}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLevelFilter(level);
              if (!open) onToggle();
            }}
            className={cn(
              'px-2 py-0.5 text-[10px] font-medium rounded transition-colors mr-0.5 cursor-pointer',
              levelFilter === level ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {level === 'ALL' ? '전체' : level}
            {level === 'ERROR' && errorCount > 0 && (
              <span className="ml-1 text-destructive">{errorCount}</span>
            )}
            {level === 'WARN' && warnCount > 0 && (
              <span className="ml-1 text-amber-500">{warnCount}</span>
            )}
          </button>
        ))}

        {selectedJobId && (
          <span
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-accent/15 text-accent ml-1"
            title={`${selectedJobId} 로그만 표시`}
          >
            {selectedJobId}
          </span>
        )}

        <div className="flex-1 min-w-2" aria-hidden />

        {open && (
          <div
            className="flex items-center gap-1 mr-2 shrink-0 cursor-text"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="검색..."
              className="w-28 bg-transparent text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none border-b border-transparent focus:border-accent/40"
            />
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAutoScroll(true);
            if (!open) onToggle();
          }}
          className={cn(
            'p-1 rounded hover:bg-muted/50 transition-colors shrink-0 cursor-pointer',
            autoScroll && 'text-accent',
          )}
          title="자동 스크롤"
        >
          <ArrowDownToLine className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSearchTerm('');
            if (!open) onToggle();
          }}
          className="p-1 rounded hover:bg-muted/50 transition-colors shrink-0 cursor-pointer"
          title="필터 초기화"
        >
          <Trash2 className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {open && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden font-mono text-[11px] leading-[18px]"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[80px] text-muted-foreground/50 text-xs">
              {logs.length === 0 ? '실행 로그가 없습니다' : '필터 조건에 맞는 로그가 없습니다'}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const config = LEVEL_CONFIG[log.level];
              const LevelIcon = config.icon;
              return (
                <div
                  key={log.id}
                  className={cn(
                    'flex items-start gap-2 px-3 py-[3px] hover:bg-muted/30 transition-colors border-l-2',
                    log.level === 'ERROR' ? 'border-l-destructive bg-destructive/[0.03]'
                    : log.level === 'WARN' ? 'border-l-amber-500/50 bg-amber-500/[0.02]'
                    : 'border-l-transparent',
                  )}
                >
                  <span className="text-muted-foreground/60 shrink-0 select-none w-[72px]">
                    {formatLogTime(log.timestamp)}
                  </span>
                  <LevelIcon className={cn('w-3 h-3 mt-[2px] shrink-0', config.color)} />
                  <span className={cn(
                    'shrink-0 px-1.5 py-0 rounded text-[9px] font-semibold',
                    config.bg, config.color,
                    'min-w-[34px] text-center',
                  )}>
                    {log.level}
                  </span>
                  <span className="text-accent/70 shrink-0 min-w-[32px]">[{log.source}]</span>
                  {log.jobId && (
                    <span className="text-muted-foreground/40 shrink-0">{log.jobId}</span>
                  )}
                  <span className={cn(
                    'flex-1 break-all',
                    log.level === 'ERROR' ? 'text-destructive/90' : log.level === 'WARN' ? 'text-amber-400/80' : 'text-foreground/70',
                  )}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
