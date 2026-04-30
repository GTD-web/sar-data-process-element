'use client';

import { useEffect, useRef } from 'react';
import { TerminalSquare, CheckCircle, Loader, AlertTriangle, Info, Bug } from 'lucide-react';
import type { LogLine, LogLevel } from './node-execution-logs';

export interface RenderedLogLine extends LogLine {
  /** 라인이 출력된 시각 (HH:MM:SS) */
  timestamp: string;
}

interface NodeExecutionTerminalProps {
  lines: RenderedLogLine[];
  isRunning: boolean;
  isDone: boolean;
  /** 실행 시작 후 경과한 ms (헤더 timer 표시용) */
  elapsedMs: number;
  title?: string;
}

const LEVEL_STYLES: Record<LogLevel, { color: string; tag: string }> = {
  info:  { color: 'text-sky-400',     tag: 'INFO' },
  ok:    { color: 'text-emerald-400', tag: 'OK  ' },
  warn:  { color: 'text-amber-400',   tag: 'WARN' },
  error: { color: 'text-red-400',     tag: 'ERR ' },
  debug: { color: 'text-zinc-500',    tag: 'DBG ' },
};

function LevelIcon({ level }: { level: LogLevel }) {
  if (level === 'ok') return <CheckCircle className="w-3 h-3 shrink-0" />;
  if (level === 'warn') return <AlertTriangle className="w-3 h-3 shrink-0" />;
  if (level === 'error') return <AlertTriangle className="w-3 h-3 shrink-0" />;
  if (level === 'debug') return <Bug className="w-3 h-3 shrink-0" />;
  return <Info className="w-3 h-3 shrink-0" />;
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export default function NodeExecutionTerminal({
  lines, isRunning, isDone, elapsedMs, title = 'execution',
}: NodeExecutionTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 로그가 추가될 때마다 자동 스크롤 down
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div className="flex flex-col h-full bg-[#0a0c10] text-zinc-200 font-mono text-[10.5px] leading-relaxed">
      {/* Terminal title bar */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-zinc-800 bg-[#11141a] px-3 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500/70" />
            <span className="h-2 w-2 rounded-full bg-amber-400/70" />
            <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
          </span>
          <TerminalSquare className="w-3 h-3 text-zinc-500 ml-1" />
          <span className="text-zinc-400 text-[10px] truncate">sdpe@worker — {title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1 text-[9px] text-zinc-400">
              <Loader className="w-2.5 h-2.5 animate-spin" />
              running
            </span>
          )}
          {isDone && (
            <span className="flex items-center gap-1 text-[9px] text-emerald-400">
              <CheckCircle className="w-2.5 h-2.5" />
              done
            </span>
          )}
          <span className="text-[9px] tabular-nums text-zinc-400">{formatElapsed(elapsedMs)}</span>
        </div>
      </div>

      {/* Log body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {lines.length === 0 && !isRunning && (
          <div className="text-zinc-600">$ awaiting execution …</div>
        )}
        {lines.map((line, i) => {
          const style = LEVEL_STYLES[line.level];
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-zinc-600 shrink-0 tabular-nums">{line.timestamp}</span>
              <span className={`${style.color} shrink-0 flex items-center gap-1`}>
                <LevelIcon level={line.level} />
                <span>[{style.tag.trim()}]</span>
              </span>
              <span className="text-zinc-200 break-all whitespace-pre-wrap min-w-0">{line.text}</span>
            </div>
          );
        })}
        {isRunning && (
          <div className="flex items-center gap-1 text-zinc-500">
            <span className="inline-block w-1.5 h-3 bg-zinc-400 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
