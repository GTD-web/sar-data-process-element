'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Settings } from 'lucide-react';

export default function ProfilesPage() {
  const profiles = [
    { id: 'PROF-001', satellite: 'KS-5', mode: 'Stripmap', polarization: 'VV', updated: '2026-03-01' },
    { id: 'PROF-002', satellite: 'KS-5', mode: 'ScanSAR', polarization: 'HH', updated: '2026-03-01' },
    { id: 'PROF-003', satellite: 'KS-5', mode: 'Spotlight', polarization: 'VV+VH', updated: '2026-02-15' },
    { id: 'PROF-004', satellite: 'KS-6', mode: 'Stripmap', polarization: 'HH', updated: '2026-03-10' },
    { id: 'PROF-005', satellite: 'KS-6', mode: 'ScanSAR', polarization: 'VV', updated: '2026-03-10' },
    { id: 'PROF-006', satellite: 'KS-7', mode: 'Stripmap', polarization: 'HH+HV', updated: '2026-04-01' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">처리 프로파일</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        위성·모드·편파 조합에 따른 처리 파라미터 프로파일입니다. v1에서는 읽기 전용입니다.
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Profile ID</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">위성</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">모드</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">편파</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">갱신일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs">{p.id}</td>
                  <td className="px-4 py-2.5 text-xs">{p.satellite}</td>
                  <td className="px-4 py-2.5 text-xs">{p.mode}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{p.polarization}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
