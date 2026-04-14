'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PipelineStepDefinition, ProcessingProfile, JobInitConfig, RetryInterval } from '@/types/pipeline';
import {
  POLARIZATION_OPTIONS,
  MAX_RETRY_COUNT,
  DEADLINE_HOUR_OPTIONS,
  RETRY_INTERVAL_LABELS,
  JOB_INIT_PROFILE_MISSING_MESSAGE,
} from '@/types/pipeline';
import { SlidersHorizontal, Save, ChevronDown, ChevronRight, Shield, Clock, Zap, UserCog, AlertTriangle } from 'lucide-react';

interface JobInitEditPanelProps {
  step: PipelineStepDefinition;
  satelliteId: string;
  mode: string;
  profiles: ProcessingProfile[];
  onSave: (step: PipelineStepDefinition) => void;
}

const DEFAULT_CONFIG: JobInitConfig = {
  polarization: 'HH',
  priority: 5,
  retryInterval: 'IMMEDIATE',
  deadlineHours: 4,
};

export default function JobInitEditPanel({ step, satelliteId, mode, profiles, onSave }: JobInitEditPanelProps) {
  const initial = step.jobInitConfig ?? DEFAULT_CONFIG;

  const [polarization, setPolarization] = useState(initial.polarization);
  const [profileId, setProfileId] = useState(initial.profileId ?? '');
  const [priority, setPriority] = useState(initial.priority);
  const [deadlineHours, setDeadlineHours] = useState<number | undefined>(initial.deadlineHours);
  const [retryInterval, setRetryInterval] = useState<RetryInterval>(initial.retryInterval);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const cfg = step.jobInitConfig ?? DEFAULT_CONFIG;
    setPolarization(cfg.polarization);
    setProfileId(cfg.profileId ?? '');
    setPriority(cfg.priority);
    setDeadlineHours(cfg.deadlineHours);
    setRetryInterval(cfg.retryInterval);
  }, [step]);

  const matchingProfiles = useMemo(
    () => profiles.filter((p) => p.satelliteId === satelliteId && p.mode === mode && p.polarization === polarization),
    [profiles, satelliteId, mode, polarization],
  );

  useEffect(() => {
    if (matchingProfiles.length > 0 && !matchingProfiles.find((p) => p.id === profileId)) {
      setProfileId(matchingProfiles[0].id);
    } else if (matchingProfiles.length === 0) {
      setProfileId('');
    }
  }, [matchingProfiles, profileId]);

  const selectedProfile = profiles.find((p) => p.id === profileId);

  const profileMissingInDefinition = !step.jobInitConfig?.profileId;

  const hasChanges = useMemo(() => {
    const orig = step.jobInitConfig ?? DEFAULT_CONFIG;
    return (
      polarization !== orig.polarization ||
      (profileId || undefined) !== orig.profileId ||
      priority !== orig.priority ||
      deadlineHours !== orig.deadlineHours ||
      retryInterval !== orig.retryInterval
    );
  }, [step, polarization, profileId, priority, deadlineHours, retryInterval]);

  const handleSave = () => {
    const config: JobInitConfig = {
      polarization,
      profileId: profileId || undefined,
      priority,
      deadlineHours,
      retryInterval,
    };
    onSave({ ...step, jobInitConfig: config });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">작업 초기화</span>
        </div>
        <div className="text-[11px] text-muted-foreground">CSU-08.02 · 작업 생성 + 프로파일 선택</div>
      </div>

      {profileMissingInDefinition && (
        <div className="flex gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-[10px] leading-relaxed text-amber-100/95">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" strokeWidth={2.25} aria-hidden />
          <p className="min-w-0">{JOB_INIT_PROFILE_MISSING_MESSAGE}</p>
        </div>
      )}

      <div className="h-px bg-border" />

      {/* Section 1: Processing Profile */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <UserCog className="w-3.5 h-3.5 text-accent" />
          처리 프로파일
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          {/* Polarization */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">편파 구성</label>
            <select
              value={polarization}
              onChange={(e) => setPolarization(e.target.value)}
              className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {POLARIZATION_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Profile Select */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">프로파일</label>
            {matchingProfiles.length > 0 ? (
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {matchingProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground/60 bg-card border border-border rounded-md">
                {satelliteId} / {mode} / {polarization} 에 해당하는 프로파일이 없습니다
              </div>
            )}
          </div>

          {/* Profile Description */}
          {selectedProfile?.description && (
            <div className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t border-border/50">
              {selectedProfile.description}
            </div>
          )}

          {/* Profile ID */}
          {selectedProfile && (
            <div className="flex justify-between text-[10px] pt-1 border-t border-border/50">
              <span className="text-muted-foreground">프로파일 ID</span>
              <span className="font-mono text-muted-foreground/70">{selectedProfile.id}</span>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Job Settings */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Zap className="w-3.5 h-3.5 text-accent" />
          작업 설정
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          {/* Priority */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted-foreground">우선순위</label>
              <span className="text-[10px] font-mono text-accent">{priority}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-0.5">
              <span>1 (최고)</span>
              <span>10 (최저)</span>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">처리 기한</label>
            <select
              value={deadlineHours ?? ''}
              onChange={(e) => setDeadlineHours(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="">미지정</option>
              {DEADLINE_HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{h}시간</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Section 3: Retry Policy */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Shield className="w-3.5 h-3.5 text-accent" />
          재시도 정책
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">최대 재시도</span>
            <span className="text-foreground font-medium">{MAX_RETRY_COUNT}회 (고정)</span>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">재시도 간격</label>
            <div className="flex gap-1.5">
              {(Object.entries(RETRY_INTERVAL_LABELS) as [RetryInterval, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRetryInterval(key)}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
                    retryInterval === key
                      ? 'bg-accent/15 border border-accent/50 text-accent'
                      : 'bg-card border border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Advanced (collapsible) */}
      <div className="space-y-2">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Clock className="w-3.5 h-3.5" />
          고급 설정
        </button>

        {advancedOpen && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="text-[10px] text-muted-foreground">
              파라미터 오버라이드 — FI 시그니처 확정 후 활성화 예정 (TBD)
            </div>
            <div className="bg-card border border-dashed border-border rounded-md p-3 text-center">
              <code className="text-[10px] text-muted-foreground/40">{'{ }'}</code>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">트리거 소스</span>
              <span className="text-foreground">자동 결정</span>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="pt-2 border-t border-border">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-30 transition-colors"
        >
          <Save className="w-3 h-3" />
          적용
        </button>
      </div>
    </div>
  );
}
