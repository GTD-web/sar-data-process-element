/**
 * 상태 뱃지 컴포넌트 — 참고용 레퍼런스
 *
 * 드롭인이 아니라 "상태 색상 컨벤션을 어떻게 적용하는지"의 예시입니다.
 * Lumir 쪽의 도메인 타입(JOB_STATUS, STEP_STATUS 등)에 맞게 JOB_STATUS_STYLES 맵을 재작성해서 사용하세요.
 *
 * 핵심 패턴:
 *   bg-{color}/15  +  text-{color}    (color ∈ accent | success | destructive | warning | muted)
 *   → 라이트/다크 모두에서 자연스러운 대비
 */

'use client';

import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Circle, Loader, XCircle, Ban } from 'lucide-react';

// ── 도메인 타입 예시 — Lumir 프로젝트에 맞게 교체 ──
type JobStatus = 'CREATED' | 'ASSIGNED' | 'COMPLETED' | 'FAILED' | 'CANCELED';

const JOB_STATUS_STYLES: Record<
  JobStatus,
  { bg: string; text: string; icon: React.ElementType; label: string }
> = {
  CREATED:   { bg: 'bg-muted/50',        text: 'text-muted-foreground', icon: Circle,       label: '대기' },
  ASSIGNED:  { bg: 'bg-accent/15',       text: 'text-accent',           icon: Loader,       label: '실행 중' },
  COMPLETED: { bg: 'bg-success/15',      text: 'text-success',          icon: CheckCircle,  label: '완료' },
  FAILED:    { bg: 'bg-destructive/15',  text: 'text-destructive',      icon: AlertCircle,  label: '실패' },
  CANCELED:  { bg: 'bg-muted/50',        text: 'text-muted-foreground', icon: Ban,          label: '취소' },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const style = JOB_STATUS_STYLES[status];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        style.bg,
        style.text,
      )}
    >
      <Icon className={cn('w-3 h-3', status === 'ASSIGNED' && 'animate-spin')} />
      {style.label}
    </span>
  );
}

// ── 범용 예시: 임의 텍스트 + 톤(ton) 기반 ──

type Tone = 'accent' | 'success' | 'destructive' | 'warning' | 'muted';

const TONE_STYLES: Record<Tone, string> = {
  accent:      'bg-accent/15 text-accent',
  success:     'bg-success/15 text-success',
  destructive: 'bg-destructive/15 text-destructive',
  warning:     'bg-warning/15 text-warning',
  muted:       'bg-muted/50 text-muted-foreground',
};

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        TONE_STYLES[tone],
      )}
    >
      {children}
    </span>
  );
}
