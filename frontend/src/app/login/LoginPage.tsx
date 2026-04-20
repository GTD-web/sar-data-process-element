'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Eye, EyeOff, Loader2, ShieldAlert, WifiOff } from 'lucide-react';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const service = usePipelineService();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/plan';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!username.trim() || !password) {
        setError('사용자명과 비밀번호를 입력하세요.');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const res = await service.로그인한다({ username: username.trim(), password });
        if (!res.success || !res.data) {
          setError(res.message || '로그인에 실패했습니다.');
          return;
        }
        if (res.data.user.requiresPasswordReset) {
          router.push('/login/reset');
          return;
        }
        router.push(redirect);
      } catch {
        setOffline(true);
        setError('서버에 연결할 수 없습니다.');
      } finally {
        setSubmitting(false);
      }
    },
    [username, password, service, router, redirect],
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Activity className="w-6 h-6 text-accent" />
          <span className="text-sm font-bold tracking-tight text-foreground">SDPE Pipeline Console</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full bg-card border border-border rounded-xl p-6 space-y-4 shadow-xl"
        >
          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-[11px] font-medium text-muted-foreground">
              사용자명
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="admin"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[11px] font-medium text-muted-foreground">
              비밀번호
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="••••••••••••"
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-destructive/15 text-destructive text-[11px] rounded-md px-3 py-2">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 bg-accent text-accent-foreground font-semibold rounded-md py-2 text-xs transition-opacity',
              submitting ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90',
            )}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            로그인
          </button>

          {offline && (
            <div className="pt-3 border-t border-border">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
                <WifiOff className="w-3.5 h-3.5" />
                <span>서버에 연결할 수 없습니다.</span>
              </div>
              <button
                type="button"
                onClick={() => router.push(`${redirect}?mode=offline`)}
                className="w-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-md py-1.5 text-[11px] transition-colors"
              >
                캐시 모드로 진입 (읽기 전용)
              </button>
            </div>
          )}
        </form>

        <div className="mt-4 text-center text-[9px] text-muted-foreground font-mono">v0.1.0 · Mock</div>

        <div className="mt-6 text-[10px] text-muted-foreground/70 leading-relaxed text-center">
          <p className="font-semibold text-muted-foreground mb-1">목업 테스트 계정</p>
          <p><code className="font-mono">admin / admin-password</code> · Administrator</p>
          <p><code className="font-mono">operator-01 / op-password</code> · Operator</p>
        </div>
      </div>
    </div>
  );
}
