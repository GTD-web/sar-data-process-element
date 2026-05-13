'use client';

import { useState } from 'react';
import type { SarStage, PipelineNodeKind, PipelineStepDefinition } from '@/types/pipeline';
import { SAR_STAGE_LABELS, SAR_STAGE_TASKS, SAR_STAGE_TO_LEVEL, SAR_STAGE_DESCRIPTIONS, NODE_KIND_INFO, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { Save, Trash2, Check, ArrowRight } from 'lucide-react';
import { HardDrive, Cpu, Layers, Compass, Map, Crosshair, Package, Database } from 'lucide-react';

const SAR_STAGES: SarStage[] = ['L0', 'L1A', 'L1B', 'L1C', 'L2A', 'L2B', 'L3'];

const SAR_STAGE_ICONS: Record<SarStage, React.ElementType> = {
  L0: HardDrive,
  L1A: Cpu,
  L1B: Layers,
  L1C: Compass,
  L2A: Map,
  L2B: Crosshair,
  L3: Package,
};

type SelectableOption = SarStage | 'CATALOG';

const ALL_OPTIONS: SelectableOption[] = [...SAR_STAGES, 'CATALOG'];

interface NodeEditPanelProps {
  step: PipelineStepDefinition;
  onSave: (step: PipelineStepDefinition) => void;
  onDelete: () => void;
}

export default function NodeEditPanel({ step, onSave, onDelete }: NodeEditPanelProps) {
  // Unified pending selection — null = no change
  const [pendingSelection, setPendingSelection] = useState<SelectableOption | null>(null);
  const [enabledTasks, setEnabledTasks] = useState<string[]>(
    step.enabledTasks ?? (step.sarStage ? SAR_STAGE_TASKS[step.sarStage] : []),
  );

  // What the original node currently is (as a SelectableOption for exclusion)
  const originalSelection: SelectableOption | null =
    step.kind === 'SAR' && step.sarStage ? step.sarStage :
    step.kind === 'CATALOG' ? 'CATALOG' : null;

  // Effective kind/stage for rendering tasks
  const effectiveKind: PipelineNodeKind =
    pendingSelection === 'CATALOG' ? 'CATALOG' :
    pendingSelection != null ? 'SAR' :
    step.kind;
  const effectiveStage: SarStage | undefined =
    pendingSelection != null && pendingSelection !== 'CATALOG' ? pendingSelection :
    pendingSelection === null ? step.sarStage : undefined;

  const allTasksForStage = effectiveStage ? SAR_STAGE_TASKS[effectiveStage] : [];

  const handleSelect = (option: SelectableOption) => {
    if (pendingSelection === option) {
      // deselect — revert to original
      setPendingSelection(null);
      setEnabledTasks(step.enabledTasks ?? (step.sarStage ? SAR_STAGE_TASKS[step.sarStage] : []));
    } else {
      setPendingSelection(option);
      setEnabledTasks(option !== 'CATALOG' ? SAR_STAGE_TASKS[option] : []);
    }
  };

  const toggleTask = (task: string) => {
    setEnabledTasks((prev) => {
      if (prev.includes(task)) {
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== task);
      }
      return [...prev, task];
    });
  };

  const originalEnabled = step.enabledTasks ?? (step.sarStage ? SAR_STAGE_TASKS[step.sarStage] : []);
  const tasksChanged =
    enabledTasks.length !== originalEnabled.length ||
    !enabledTasks.every((t) => originalEnabled.includes(t));

  const selectionChanged = pendingSelection !== null;
  const changed = selectionChanged || tasksChanged;

  const handleSave = () => {
    if (pendingSelection === 'CATALOG' || effectiveKind === 'CATALOG') {
      onSave({ order: step.order, kind: 'CATALOG' });
    } else {
      const finalStage = effectiveStage;
      const allTasks = finalStage ? SAR_STAGE_TASKS[finalStage] : [];
      const finalEnabledTasks =
        finalStage && enabledTasks.length < allTasks.length ? enabledTasks : undefined;
      onSave({ order: step.order, kind: 'SAR', sarStage: finalStage, enabledTasks: finalEnabledTasks });
    }
  };

  if (step.kind === 'TRIGGER') {
    return (
      <div className="p-4 space-y-3">
        <div className="text-xs text-muted-foreground">The raw data reception trigger node cannot be edited.</div>
        <div className="bg-muted/30 rounded-md p-3 text-[11px] text-muted-foreground">
          The pipeline is started by the EI-01 RAW_DATA_RECEIVED event. This node is always the pipeline entry point.
        </div>
      </div>
    );
  }

  // Header — always shows original step info
  const OriginalIcon = step.kind === 'SAR' && step.sarStage ? SAR_STAGE_ICONS[step.sarStage] : Database;
  const originalLabel =
    step.kind === 'SAR' && step.sarStage ? `${step.sarStage} — ${SAR_STAGE_LABELS[step.sarStage]}` : 'Catalog Registration';
  const originalSub =
    step.kind === 'SAR' && step.sarStage ? PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[step.sarStage]] : 'CSC-07';
  const originalDesc =
    step.kind === 'SAR' && step.sarStage
      ? SAR_STAGE_DESCRIPTIONS[step.sarStage]
      : NODE_KIND_INFO['CATALOG']?.description;

  // Pending label for header arrow
  const pendingLabel =
    pendingSelection === 'CATALOG' ? 'Catalog Registration' :
    pendingSelection != null ? pendingSelection : null;

  // Options to show: all except the original selection
  const options = ALL_OPTIONS.filter((o) => o !== originalSelection);

  return (
    <div className="p-4 space-y-4">
      {/* Node identity header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
          <OriginalIcon className="w-4.5 h-4.5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground leading-tight">{originalLabel}</div>
            {pendingLabel && (
              <div className="flex items-center gap-1 text-[10px] text-accent font-medium">
                <ArrowRight className="w-3 h-3" />
                {pendingLabel}
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">Step #{step.order} · {originalSub}</div>
        </div>
      </div>

      {/* Description */}
      {originalDesc && (
        <div className="text-[11px] text-muted-foreground leading-relaxed">{originalDesc}</div>
      )}

      <div className="h-px bg-border" />

      {/* Unified stage / kind selector */}
      {options.length > 0 && (
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1.5">Change</label>
          <div className="space-y-1">
            {options.map((option) => {
              const isCatalogOption = option === 'CATALOG';
              const Icon = isCatalogOption ? Database : SAR_STAGE_ICONS[option];
              const isSelected = pendingSelection === option;
              const stageLabel = isCatalogOption ? 'Catalog Registration' : SAR_STAGE_LABELS[option];
              const sub = isCatalogOption ? 'CSC-07 · Register' : PRODUCT_LEVEL_LABELS[SAR_STAGE_TO_LEVEL[option]];
              return (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-accent/15 border border-accent/50 text-accent'
                      : 'bg-muted/30 border border-transparent text-foreground/75 hover:bg-muted/60 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{isCatalogOption ? 'Catalog Registration' : option}</span>
                      <span className={`text-[10px] font-mono ${isSelected ? 'opacity-70' : 'text-foreground/50'}`}>{sub}</span>
                    </div>
                    <div className={`text-[10px] truncate ${isSelected ? 'opacity-70' : 'text-foreground/50'}`}>{stageLabel}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tasks — only for SAR effective state */}
      {effectiveKind === 'SAR' && effectiveStage && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-muted-foreground">
              Tasks {selectionChanged && <span className="text-accent">({effectiveStage})</span>}
            </label>
            <span className={`text-[10px] font-mono ${enabledTasks.length < allTasksForStage.length ? 'text-accent' : 'text-muted-foreground/60'}`}>
              {enabledTasks.length}/{allTasksForStage.length}
            </span>
          </div>
          <div className="space-y-0.5">
            {allTasksForStage.map((task) => {
              const isEnabled = enabledTasks.includes(task);
              const isLast = enabledTasks.length === 1 && isEnabled;
              return (
                <button
                  key={task}
                  onClick={() => toggleTask(task)}
                  disabled={isLast}
                  className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-[10px] transition-colors ${
                    isEnabled
                      ? 'bg-accent/10 text-foreground'
                      : 'bg-transparent text-muted-foreground/50 line-through'
                  } ${isLast ? 'cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'}`}
                  title={isLast ? 'At least one task must be selected' : undefined}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-colors ${
                      isEnabled ? 'bg-accent border-accent' : 'bg-transparent border-muted-foreground/30'
                    }`}
                  >
                    {isEnabled && <Check className="w-2.5 h-2.5 text-accent-foreground" strokeWidth={3} />}
                  </span>
                  {task}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          onClick={handleSave}
          disabled={!changed}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-30 transition-colors"
        >
          <Save className="w-3 h-3" />
          Apply
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  );
}
