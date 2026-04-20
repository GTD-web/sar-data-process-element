'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, UserCog, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import type { Role, User } from '@/types/user';
import { validatePasswordPolicy } from './password-policy';

type Mode =
  | { kind: 'create' }
  | { kind: 'edit'; user: User };

interface Props {
  open: boolean;
  mode: Mode | null;
  onClose: () => void;
  onSaved: () => void;
  currentUserId?: string | null;
}

export default function UserFormModal({ open, mode, onClose, onSaved, currentUserId }: Props) {
  const service = usePipelineService();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Operator');
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode?.kind === 'edit';
  const isSelf = isEdit && mode.user.id === currentUserId;

  useEffect(() => {
    if (!open || !mode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 모달 open/mode 변경 시 폼 필드 초기화 (props → 로컬 상태 동기화)
    setError(null);
    setSubmitting(false);
    if (mode.kind === 'edit') {
      setUsername(mode.user.username);
      setEmail(mode.user.email);
      setRole(mode.user.role);
      setActive(mode.user.active);
      setPassword('');
    } else {
      setUsername('');
      setEmail('');
      setRole('Operator');
      setActive(true);
      setPassword('');
    }
  }, [open, mode]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!mode) return;

      if (mode.kind === 'create') {
        if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(username)) {
          setError('사용자명은 3~32자, 소문자·숫자·하이픈만 사용 가능합니다.');
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setError('올바른 이메일 형식이 아닙니다.');
          return;
        }
        const policyError = validatePasswordPolicy(password);
        if (policyError) {
          setError(policyError);
          return;
        }
        setSubmitting(true);
        setError(null);
        const res = await service.사용자를_생성한다({ username, email, role, password });
        setSubmitting(false);
        if (!res.success) {
          setError(res.message || '사용자 생성에 실패했습니다.');
          return;
        }
        toast.success('사용자가 생성되었습니다');
        onSaved();
        onClose();
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setError('올바른 이메일 형식이 아닙니다.');
          return;
        }
        setSubmitting(true);
        setError(null);
        const res = await service.사용자를_수정한다(mode.user.id, { email, role, active });
        setSubmitting(false);
        if (!res.success) {
          setError(res.message || '사용자 수정에 실패했습니다.');
          return;
        }
        toast.success('사용자 정보가 수정되었습니다');
        onSaved();
        onClose();
      }
    },
    [mode, username, email, role, active, password, service, onSaved, onClose],
  );

  if (!open || !mode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-[26rem] bg-card border border-border rounded-lg shadow-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isEdit ? <UserCog className="w-4 h-4 text-accent" /> : <UserPlus className="w-4 h-4 text-accent" />}
            <h2 className="text-sm font-semibold text-foreground">{isEdit ? '사용자 수정' : '사용자 추가'}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Username */}
        <Field label="사용자명">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isEdit}
            placeholder="operator-05"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </Field>

        {/* Email */}
        <Field label="이메일">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@sdpe.lumir.local"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </Field>

        {/* Role */}
        <Field label="역할">
          <div className="grid grid-cols-2 gap-1.5">
            {(['Administrator', 'Operator'] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                disabled={isSelf && isEdit}
                className={cn(
                  'px-3 py-2 rounded-md border text-[11px] font-medium transition-colors',
                  role === r
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-muted-foreground hover:bg-muted/30',
                  isSelf && isEdit && 'opacity-60 cursor-not-allowed',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {isSelf && isEdit && (
            <div className="text-[10px] text-muted-foreground mt-1">본인 계정의 역할은 변경할 수 없습니다.</div>
          )}
        </Field>

        {/* Initial password (create only) */}
        {!isEdit && (
          <Field label="초기 비밀번호">
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Temp-Password-2026!"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              최소 12자. 대/소/숫자/특수문자 각 1개. 최초 로그인 시 사용자가 변경해야 합니다.
            </div>
          </Field>
        )}

        {/* Active (edit only) */}
        {isEdit && (
          <Field label="활성 상태">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActive((v) => !v)}
                disabled={isSelf}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  active ? 'bg-success' : 'bg-muted',
                  isSelf && 'opacity-60 cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform',
                    active ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
              <span className="text-[11px] text-foreground">{active ? '활성' : '비활성'}</span>
            </div>
            {isSelf && <div className="text-[10px] text-muted-foreground mt-1">본인 계정은 비활성화할 수 없습니다.</div>}
          </Field>
        )}

        {error && (
          <div className="bg-destructive/15 text-destructive text-[11px] rounded-md px-3 py-2 leading-relaxed">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-3 py-1.5 text-[11px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-md transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'px-3 py-1.5 text-[11px] font-semibold rounded-md bg-accent text-accent-foreground flex items-center gap-1.5 transition-opacity',
              submitting ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90',
            )}
          >
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            {isEdit ? '저장' : '생성'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
