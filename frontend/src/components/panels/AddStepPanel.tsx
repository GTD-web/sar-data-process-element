'use client';

import type { TargetCsc, ProductLevel } from '@/types/pipeline';
import { CSC_LABELS, PRODUCT_LEVEL_LABELS } from '@/types/pipeline';
import { Satellite, Radio, Cpu, SlidersHorizontal, Globe, Database } from 'lucide-react';

interface CscOption {
  csc: TargetCsc;
  defaultLevel: ProductLevel;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}

const CSC_OPTIONS: CscOption[] = [
  { csc: 'CSC-02', defaultLevel: 'LEVEL_0', icon: Satellite, color: 'text-foreground', bgColor: 'bg-muted/30 border-border', description: '위성으로부터 원시 데이터를 수신합니다' },
  { csc: 'CSC-03', defaultLevel: 'LEVEL_0', icon: Radio, color: 'text-foreground', bgColor: 'bg-muted/30 border-border', description: 'SAR 신호의 Range 방향 압축을 수행합니다' },
  { csc: 'CSC-04', defaultLevel: 'LEVEL_1', icon: Cpu, color: 'text-foreground', bgColor: 'bg-muted/30 border-border', description: 'Azimuth 압축 등 핵심 SAR 신호처리를 수행합니다' },
  { csc: 'CSC-05', defaultLevel: 'LEVEL_2', icon: SlidersHorizontal, color: 'text-foreground', bgColor: 'bg-muted/30 border-border', description: '방사 보정, 기하 보정 등 후처리를 수행합니다' },
  { csc: 'CSC-06', defaultLevel: 'LEVEL_3', icon: Globe, color: 'text-foreground', bgColor: 'bg-muted/30 border-border', description: '지리 좌표계로 변환(Geocoding)합니다' },
  { csc: 'CSC-07', defaultLevel: 'LEVEL_3', icon: Database, color: 'text-foreground', bgColor: 'bg-muted/30 border-border', description: '산출물을 카탈로그에 등록합니다' },
];

interface AddStepPanelProps {
  insertAfterOrder: number;
  insertBeforeOrder?: number;
  onSelect: (afterOrder: number, targetCsc: TargetCsc, productLevel: ProductLevel) => void;
}

export default function AddStepPanel({ insertAfterOrder, insertBeforeOrder, onSelect }: AddStepPanelProps) {
  const description = insertBeforeOrder !== undefined
    ? `단계 #${insertAfterOrder}과 #${insertBeforeOrder} 사이에 추가할 단계를 선택하세요.`
    : insertAfterOrder === 0
      ? '파이프라인 맨 앞에 추가할 단계를 선택하세요.'
      : `단계 #${insertAfterOrder} 뒤에 추가할 단계를 선택하세요.`;

  return (
    <div className="p-4 space-y-3">
      <div className="text-xs text-muted-foreground">
        {description}
      </div>

      <div className="space-y-2">
        {CSC_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.csc}
              onClick={() => onSelect(insertAfterOrder, opt.csc, opt.defaultLevel)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all hover:scale-[1.01] active:scale-[0.99] ${opt.bgColor}`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 flex-shrink-0 ${opt.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{opt.csc}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{PRODUCT_LEVEL_LABELS[opt.defaultLevel]}</span>
                </div>
                <div className="text-xs text-foreground/80">{CSC_LABELS[opt.csc]}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
