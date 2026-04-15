'use client';

import { useState, useMemo } from 'react';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';
import type { QueueHealth } from '@/types/pipeline';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  X, Inbox, RotateCcw, TrendingUp, Skull,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';

interface QueueDetailPanelProps {
  queue: QueueHealth;
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Trend Badge
// ---------------------------------------------------------------------------
function TrendBadge({ data }: { data: { depth: number }[] }) {
  if (data.length < 2) return null;
  const last = data[data.length - 1]!.depth;
  const prev = data[data.length - 2]!.depth;
  const diff = last - prev;
  if (diff > 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-warning"><ArrowUpRight className="w-3.5 h-3.5" />+{diff}</span>;
  if (diff < 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-success"><ArrowDownRight className="w-3.5 h-3.5" />{diff}</span>;
  return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground"><Minus className="w-3.5 h-3.5" />0</span>;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { time: string; depth: number } }[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-md shadow-lg px-3 py-2 text-xs">
      <div className="text-muted-foreground mb-1">{d.time}</div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span className="text-foreground">Depth: <span className="font-mono font-bold">{d.depth}</span></span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------
export default function QueueDetailPanel({ queue: q, onClose }: QueueDetailPanelProps) {
  const [section, setSection] = useState<'messages' | 'deadLetters'>('messages');
  const shortName = q.queue.replace('sdpe.', '');

  const sortedMessages = useMemo(
    () => [...q.messages].sort((a, b) => a.priority - b.priority),
    [q.messages],
  );

  const chartData = useMemo(
    () => q.depthHistory.map((d) => {
      const dt = new Date(d.timestamp);
      return {
        time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
        depth: d.depth,
      };
    }),
    [q.depthHistory],
  );

  return (
    <div className="h-full w-full bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold font-mono text-foreground">{shortName}</span>
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
            q.healthy ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
          )}>
            {q.healthy ? 'Healthy' : 'Unhealthy'}
          </span>
          <TrendBadge data={q.depthHistory} />
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-px bg-border/30">
          <MetricCell label="Depth" value={String(q.depth)} accent={q.depth > 10} />
          <MetricCell label="Consumers" value={String(q.consumers)} />
          <MetricCell label="Oldest" value={q.oldestMessageAge > 0 ? formatDuration(q.oldestMessageAge * 1000) : '—'} />
          <MetricCell label="Dead Letters" value={String(q.deadLetters.length)} destructive={q.deadLetters.length > 0} />
        </div>

        {/* Depth Chart (recharts) */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Depth 추이 (최근 1시간)</span>
            <TrendBadge data={q.depthHistory} />
          </div>
          <div className="bg-muted/15 rounded-lg p-2">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="depthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="depth"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#depthGrad)"
                  dot={{ r: 3, fill: 'var(--color-accent)', stroke: 'var(--color-card)', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: 'var(--color-accent)', stroke: 'var(--color-card)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Throughput */}
        <div className="px-4 py-3 border-t border-border/40">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">처리량 통계</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ThroughputCard value={String(q.throughput.processed1h)} label="최근 1h" />
            <ThroughputCard value={String(q.throughput.processed24h)} label="최근 24h" />
            <ThroughputCard value={formatDuration(q.throughput.avgProcessingMs)} label="평균 처리" />
          </div>
        </div>

        {/* Segment Tabs */}
        <div className="flex border-t border-b border-border/50">
          <button
            type="button"
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium transition-colors',
              section === 'messages' ? 'text-foreground border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setSection('messages')}
          >
            <Inbox className="w-3.5 h-3.5 inline mr-1.5" />
            대기 메시지 ({q.messages.length})
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium transition-colors',
              section === 'deadLetters' ? 'text-foreground border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setSection('deadLetters')}
          >
            <Skull className={cn('w-3.5 h-3.5 inline mr-1.5', q.deadLetters.length > 0 && 'text-destructive')} />
            Dead Letters ({q.deadLetters.length})
          </button>
        </div>

        {/* Messages table */}
        {section === 'messages' && (
          <div className="flex-1 overflow-y-auto">
            {sortedMessages.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">대기 중인 메시지가 없습니다</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border/30 text-muted-foreground">
                    <th className="text-left px-4 py-1.5 font-medium">Job ID</th>
                    <th className="text-left px-2 py-1.5 font-medium">위성</th>
                    <th className="text-left px-2 py-1.5 font-medium">스테이지</th>
                    <th className="text-center px-2 py-1.5 font-medium">P</th>
                    <th className="text-right px-4 py-1.5 font-medium">대기</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMessages.map((msg) => (
                    <tr key={msg.messageId} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-1.5 font-mono text-foreground">{msg.jobId}</td>
                      <td className="px-2 py-1.5 text-foreground">{msg.satelliteId}</td>
                      <td className="px-2 py-1.5 font-mono text-foreground">{msg.sarStage ?? '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={cn(
                          'inline-block font-mono px-1.5 py-0.5 rounded text-[10px] font-medium',
                          msg.priority === 1 ? 'bg-destructive/15 text-destructive'
                            : msg.priority === 2 ? 'bg-warning/15 text-warning'
                              : 'bg-muted text-muted-foreground',
                        )}>
                          P{msg.priority}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-right text-muted-foreground">{formatRelativeTime(msg.enqueuedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Dead Letters */}
        {section === 'deadLetters' && (
          <div className="flex-1 overflow-y-auto">
            {q.deadLetters.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">실패 메시지가 없습니다</div>
            ) : (
              <div className="divide-y divide-border/30">
                {q.deadLetters.map((dl) => (
                  <div key={dl.messageId} className="px-4 py-2.5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-foreground">{dl.jobId}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono">
                          재시도 {dl.retryCount}회
                        </span>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        재시도
                      </button>
                    </div>
                    <p className="text-xs text-destructive/80 leading-snug break-all">{dl.errorMessage}</p>
                    <div className="text-[10px] text-muted-foreground mt-1">{formatRelativeTime(dl.failedAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCell({ label, value, accent, destructive }: {
  label: string; value: string; accent?: boolean; destructive?: boolean;
}) {
  return (
    <div className="bg-card px-3 py-2.5 text-center">
      <div className={cn(
        'text-base font-mono font-bold',
        destructive ? 'text-destructive' : accent ? 'text-warning' : 'text-foreground',
      )}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function ThroughputCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-muted/20 rounded-lg px-3 py-2 text-center">
      <div className="text-lg font-mono font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
