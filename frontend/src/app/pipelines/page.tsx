'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePipelineService } from '@/services/usePipelineService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { PipelineDefinition, TargetCsc, ProductLevel } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { GitBranch, ChevronRight, Plus, X, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

const ALL_CSC: TargetCsc[] = ['CSC-02', 'CSC-03', 'CSC-04', 'CSC-05', 'CSC-06', 'CSC-07'];
const ALL_LEVELS: ProductLevel[] = ['LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'];

export default function PipelinesPage() {
  const service = usePipelineService();
  const router = useRouter();
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await service.파이프라인_목록을_조회한다();
    if (res.data) setPipelines(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">파이프라인 정의</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          새 파이프라인
        </button>
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <CreatePipelineDialog
          onClose={() => setShowCreate(false)}
          onCreated={(pl) => {
            setShowCreate(false);
            router.push(`/pipelines/${pl.id}`);
          }}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : pipelines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">파이프라인이 없습니다</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-xs text-accent hover:underline"
            >
              첫 파이프라인 만들기
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelines.map((pl) => (
            <Link key={pl.id} href={`/pipelines/${pl.id}`}>
              <Card className="hover:border-accent/50 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-accent" />
                    <CardTitle>{pl.name}</CardTitle>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>위성: {pl.satelliteId}</span>
                    <span>모드: {pl.mode}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pl.steps.map((step) => (
                      <span
                        key={step.order}
                        className="px-2 py-0.5 rounded bg-muted/50 text-[11px] text-muted-foreground font-mono"
                      >
                        {step.targetCsc}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePipelineDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (pl: PipelineDefinition) => void;
}) {
  const service = usePipelineService();
  const [name, setName] = useState('');
  const [satellite, setSatellite] = useState('KS-5');
  const [mode, setMode] = useState('Stripmap');
  const [steps, setSteps] = useState<{ targetCsc: TargetCsc; productLevel: ProductLevel }[]>([
    { targetCsc: 'CSC-02', productLevel: 'LEVEL_0' },
    { targetCsc: 'CSC-03', productLevel: 'LEVEL_0' },
    { targetCsc: 'CSC-04', productLevel: 'LEVEL_1' },
    { targetCsc: 'CSC-05', productLevel: 'LEVEL_2' },
    { targetCsc: 'CSC-06', productLevel: 'LEVEL_3' },
    { targetCsc: 'CSC-07', productLevel: 'LEVEL_3' },
  ]);
  const [saving, setSaving] = useState(false);

  function addStep() {
    setSteps((prev) => [...prev, { targetCsc: 'CSC-03', productLevel: 'LEVEL_0' }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: 'targetCsc' | 'productLevel', value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) { alert('파이프라인 이름을 입력해주세요.'); return; }
    if (steps.length === 0) { alert('최소 1개 이상의 단계가 필요합니다.'); return; }
    setSaving(true);
    const res = await service.파이프라인을_생성한다({ name, satelliteId: satellite, mode, steps });
    setSaving(false);
    if (res.data) onCreated(res.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>새 파이프라인</CardTitle>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <label className="text-[11px] text-muted-foreground block mb-1">파이프라인 이름</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: KS-5 Stripmap Pipeline"
                className="w-full text-sm bg-muted/50 border border-border rounded-md px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">위성 ID</label>
              <input
                value={satellite}
                onChange={(e) => setSatellite(e.target.value)}
                className="w-full text-sm bg-muted/50 border border-border rounded-md px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">모드</label>
              <input
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full text-sm bg-muted/50 border border-border rounded-md px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-end">
              <span className="text-xs text-muted-foreground">{steps.length}개 단계</span>
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">단계 구성</span>
              <button
                onClick={addStep}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/20 text-accent text-[11px] font-medium hover:bg-accent/30 transition-colors"
              >
                <Plus className="w-3 h-3" />
                추가
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveStep(index, -1)} disabled={index === 0} className="p-0.5 disabled:opacity-20">
                      <ArrowUp className="w-2.5 h-2.5 text-muted-foreground" />
                    </button>
                    <span className="text-[10px] font-mono text-muted-foreground text-center">{index + 1}</span>
                    <button onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="p-0.5 disabled:opacity-20">
                      <ArrowDown className="w-2.5 h-2.5 text-muted-foreground" />
                    </button>
                  </div>
                  <select
                    value={step.targetCsc}
                    onChange={(e) => updateStep(index, 'targetCsc', e.target.value)}
                    className="flex-1 text-xs bg-card border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {ALL_CSC.map((csc) => (
                      <option key={csc} value={csc}>{csc} — {CSC_LABELS[csc]}</option>
                    ))}
                  </select>
                  <select
                    value={step.productLevel}
                    onChange={(e) => updateStep(index, 'productLevel', e.target.value)}
                    className="w-28 text-xs bg-card border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {ALL_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>{PRODUCT_LEVEL_LABELS[lv]}</option>
                    ))}
                  </select>
                  <button onClick={() => removeStep(index)} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-muted/50 text-muted-foreground text-xs font-medium hover:text-foreground transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
            >
              {saving ? '생성 중...' : '생성'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
