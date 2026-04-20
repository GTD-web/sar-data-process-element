'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Copy, KeyRound, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import type { User } from '@/types/user';

export default function PasswordResetModal({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
}) {
  const service = usePipelineService();
  const [stage, setStage] = useState<'confirm' | 'result'>('confirm');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 모달 open 변경 시 내부 상태 리셋 (props → 로컬 상태 동기화)
    setStage('confirm');
    setConfirmText('');
    setSubmitting(false);
    setTempPassword(null);
    setError(null);
  }, [open]);

  const handleConfirm = useCallback(async () => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    const res = await service.사용자_비밀번호를_초기화한다(user.id);
    setSubmitting(false);
    if (!res.success || !res.data) {
      setError(res.message || '비밀번호 초기화에 실패했습니다.');
      return;
    }
    setTempPassword(res.data.temporaryPassword);
    setStage('result');
  }, [user, service]);

  const handleCopy = useCallback(async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      toast.success('임시 비밀번호가 복사되었습니다');
    } catch {
      toast.error('클립보드 복사에 실패했습니다');
    }
  }, [tempPassword]);

  if (!open || !user) return null;

  const canSubmit = confirmText === user.username && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-[26rem] bg-card border border-border rounded-lg shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">비밀번호 초기화</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {stage === 'confirm' ? (
          <>
            <div className="flex items-start gap-2 bg-destructive/15 text-destructive text-[11px] rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="leading-relaxed">
                <div className="font-semibold">
                  <span className="font-mono">{user.username}</span> 의 비밀번호를 초기화합니다.
                </div>
                <div className="text-destructive/80 mt-0.5">기존 비밀번호는 즉시 폐기되며 사용자는 임시 비밀번호로 재로그인해야 합니다.</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-muted-foreground">
                확인을 위해 사용자명 <span className="font-mono text-foreground">{user.username}</span> 을 입력하세요.
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {error && (
              <div className="bg-destructive/15 text-destructive text-[11px] rounded-md px-3 py-2">{error}</div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3 py-1.5 text-[11px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-md transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canSubmit}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-semibold rounded-md bg-destructive text-white flex items-center gap-1.5 transition-opacity',
                  !canSubmit ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90',
                )}
              >
                {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                초기화
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 bg-accent/10 border border-accent/30 rounded-md px-3 py-2">
              <KeyRound className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
              <div className="text-[11px] text-foreground leading-relaxed">
                <div className="font-semibold">임시 비밀번호가 생성되었습니다</div>
                <div className="text-muted-foreground mt-0.5">이 창을 닫으면 다시 볼 수 없습니다. 사용자에게 안전한 경로로 전달하세요.</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground font-mono tracking-wide select-all break-all">
                {tempPassword}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded-md border border-border hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
                title="복사"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-[10px] text-muted-foreground leading-relaxed">
              사용자는 최초 로그인 시 새 비밀번호로 변경해야 합니다.
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
              >
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
