'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { PipelineDefinition, PipelineStep, PipelineStepDefinition, TargetCsc, ProductLevel } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Pencil,
  X,
} from 'lucide-react';

const PipelineGraph = dynamic(() => import('@/components/graph/PipelineGraph'), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] bg-card rounded-lg border border-border flex items-center justify-center text-muted-foreground text-sm">
      그래프 로딩 중...
    </div>
  ),
});

const ALL_CSC: TargetCsc[] = ['CSC-02', 'CSC-03', 'CSC-04', 'CSC-05', 'CSC-06', 'CSC-07'];
const ALL_LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

export default function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const service = usePipelineService();

  const [pipeline, setPipeline] = useState<PipelineDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [editName, setEditName] = useState('');
  const [editSatellite, setEditSatellite] = useState('');
  const [editMode, setEditMode] = useState('');
  const [editSteps, setEditSteps] = useState<{ targetCsc: TargetCsc; productLevel: ProductLevel }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await service.파이프라인을_조회한다(id);
    if (res.data) {
      setPipeline(res.data);
      resetEditState(res.data);
    }
    setLoading(false);
  }, [service, id]);

  useEffect(() => { load(); }, [load]);

  function resetEditState(pl: PipelineDefinition) {
    setEditName(pl.name);
    setEditSatellite(pl.satelliteId);
    setEditMode(pl.mode);
    setEditSteps(pl.steps.map((s) => ({ targetCsc: s.targetCsc, productLevel: s.productLevel })));
  }

  function startEdit() {
    if (pipeline) resetEditState(pipeline);
    setEditing(true);
  }

  function cancelEdit() {
    if (pipeline) resetEditState(pipeline);
    setEditing(false);
  }

  async function handleSave() {
    if (editSteps.length === 0) {
      alert('최소 1개 이상의 단계가 필요합니다.');
      return;
    }
    setSaving(true);
    const res = await service.파이프라인을_수정한다(id, {
      name: editName,
      satelliteId: editSatellite,
      mode: editMode,
      steps: editSteps,
    });
    if (res.data) {
      setPipeline(res.data);
    }
    setSaving(false);
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm('이 파이프라인을 삭제하시겠습니까?')) return;
    await service.파이프라인을_삭제한다(id);
    router.push('/pipelines');
  }

  function addStep() {
    setEditSteps((prev) => [...prev, { targetCsc: 'CSC-03', productLevel: 'LEVEL_0' }]);
  }

  function removeStep(index: number) {
    setEditSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: 'targetCsc' | 'productLevel', value: string) {
    setEditSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= editSteps.length) return;
    setEditSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Graph preview from edit state
  const stepsSource = editing ? editSteps : (pipeline?.steps ?? []);
  const previewSteps: PipelineStep[] = stepsSource.map((s, i) => ({
    order: i + 1,
    targetCsc: s.targetCsc,
    productLevel: s.productLevel,
    status: 'PENDING' as const,
  }));

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-[350px] bg-card border border-border rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <p className="text-muted-foreground">파이프라인을 찾을 수 없습니다</p>
        <Link href="/pipelines" className="text-accent text-sm hover:underline">
          ���이프라인 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/pipelines" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          {editing ? (
            <div className="space-y-1">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-lg font-semibold bg-transparent border-b border-accent text-foreground focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  value={editSatellite}
                  onChange={(e) => setEditSatellite(e.target.value)}
                  placeholder="위성 ID"
                  className="text-xs bg-muted/50 border border-border rounded px-2 py-0.5 text-foreground w-20 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value)}
                  placeholder="모드"
                  className="text-xs bg-muted/50 border border-border rounded px-2 py-0.5 text-foreground w-24 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-lg font-semibold">{pipeline.name}</h1>
              <div className="text-xs text-muted-foreground">
                {pipeline.satelliteId} · {pipeline.mode} · {pipeline.steps.length}단계
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 text-muted-foreground text-xs font-medium hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? '저장 중...' : '저장'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                편집
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                삭제
              </button>
            </>
          )}
        </div>
      </div>

      {/* Graph Preview */}
      {previewSteps.length > 0 && <PipelineGraph steps={previewSteps} />}

      {/* Step Editor / Viewer */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>단계 구성 {editing && <span className="text-accent font-normal">(편집 중)</span>}</CardTitle>
          {editing && (
            <button
              onClick={addStep}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent/20 text-accent text-xs font-medium hover:bg-accent/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              단계 추가
            </button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {editing ? (
            <div className="divide-y divide-border">
              {editSteps.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  단계가 없습니다. &quot;단계 추가&quot; 버튼을 눌러주세요.
                </div>
              )}
              {editSteps.map((step, index) => (
                <div key={index} className="px-4 py-3 flex items-center gap-3">
                  {/* Order & Grip */}
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-20 transition-colors"
                    >
                      <ArrowUp className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-mono text-muted-foreground">
                      {index + 1}
                    </span>
                    <button
                      onClick={() => moveStep(index, 1)}
                      disabled={index === editSteps.length - 1}
                      className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-20 transition-colors"
                    >
                      <ArrowDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>

                  {/* CSC Select */}
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">대상 CSC</label>
                      <select
                        value={step.targetCsc}
                        onChange={(e) => updateStep(index, 'targetCsc', e.target.value)}
                        className="w-full text-xs bg-muted/50 border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {ALL_CSC.map((csc) => (
                          <option key={csc} value={csc}>
                            {csc} — {CSC_LABELS[csc]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">산출물 레벨</label>
                      <select
                        value={step.productLevel}
                        onChange={(e) => updateStep(index, 'productLevel', e.target.value)}
                        className="w-full text-xs bg-muted/50 border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {ALL_LEVELS.map((lv) => (
                          <option key={lv} value={lv}>
                            {PRODUCT_LEVEL_LABELS[lv]} ({lv})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeStep(index)}
                    className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pipeline.steps.map((step) => (
                <div key={step.order} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-mono text-muted-foreground">
                      {step.order}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{step.targetCsc}</div>
                      <div className="text-xs text-muted-foreground">{CSC_LABELS[step.targetCsc]}</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {PRODUCT_LEVEL_LABELS[step.productLevel]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
