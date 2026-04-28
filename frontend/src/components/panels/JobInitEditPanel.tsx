'use client';

import { useState, useMemo } from 'react';
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

function profileMatchesTags(profile: ProcessingProfile, satelliteId: string, mode: string, polarization: string) {
  const satelliteTags = profile.satelliteTags ?? (profile.satelliteId ? [profile.satelliteId] : []);
  const modeTags = profile.modeTags ?? (profile.mode ? [profile.mode] : []);
  const polarizationTags = profile.polarizationTags ?? (profile.polarization ? [profile.polarization] : []);
  return (
    (satelliteTags.length === 0 || satelliteTags.includes(satelliteId)) &&
    (modeTags.length === 0 || modeTags.includes(mode)) &&
    (polarizationTags.length === 0 || polarizationTags.includes(polarization))
  );
}

export default function JobInitEditPanel({ step, satelliteId, mode, profiles, onSave }: JobInitEditPanelProps) {
  const initial = step.jobInitConfig ?? DEFAULT_CONFIG;

  const [polarization, setPolarization] = useState(initial.polarization);
  const [profileId, setProfileId] = useState(initial.profileId ?? '');
  const [priority, setPriority] = useState(initial.priority);
  const [deadlineHours, setDeadlineHours] = useState<number | undefined>(initial.deadlineHours);
  const [retryInterval, setRetryInterval] = useState<RetryInterval>(initial.retryInterval);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const matchingProfiles = useMemo(
    () => profiles.filter((p) => profileMatchesTags(p, satelliteId, mode, polarization)),
    [profiles, satelliteId, mode, polarization],
  );

  const handlePolarizationChange = (newPol: string) => {
    setPolarization(newPol);
    const next = profiles.filter((p) => profileMatchesTags(p, satelliteId, mode, newPol));
    if (next.length === 0) {
      setProfileId('');
    } else if (!next.find((p) => p.id === profileId)) {
      setProfileId(next[0].id);
    }
  };

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
          <span className="text-sm font-semibold text-foreground">Job Initialization</span>
        </div>
        <div className="text-[11px] text-muted-foreground">CSU-08.02 · Job creation + profile selection</div>
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
          Processing Profile
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          {/* Polarization */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Polarization</label>
            <select
              value={polarization}
              onChange={(e) => handlePolarizationChange(e.target.value)}
              className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {POLARIZATION_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Profile Select */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Profile</label>
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
                No profile tags match {satelliteId} / {mode} / {polarization}
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
              <span className="text-muted-foreground">Profile ID</span>
              <span className="font-mono text-muted-foreground/70">{selectedProfile.id}</span>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Job Settings */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Zap className="w-3.5 h-3.5 text-accent" />
          Job Settings
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          {/* Priority */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted-foreground">Priority</label>
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
              <span>1 (highest)</span>
              <span>10 (lowest)</span>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Deadline</label>
            <select
              value={deadlineHours ?? ''}
              onChange={(e) => setDeadlineHours(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="">Not set</option>
              {DEADLINE_HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{h} hours</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Section 3: Retry Policy */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Shield className="w-3.5 h-3.5 text-accent" />
          Retry Policy
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Max retries</span>
            <span className="text-foreground font-medium">{MAX_RETRY_COUNT} fixed</span>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Retry interval</label>
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
          Advanced Settings
        </button>

        {advancedOpen && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="text-[10px] text-muted-foreground">
              Parameter overrides will be enabled after the FI signature is finalized.
            </div>
            <div className="bg-card border border-dashed border-border rounded-md p-3 text-center">
              <code className="text-[10px] text-muted-foreground/40">{'{ }'}</code>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Trigger source</span>
              <span className="text-foreground">Auto</span>
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
          Apply
        </button>
      </div>
    </div>
  );
}
