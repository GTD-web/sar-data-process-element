'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Loader2, ShieldAlert, KeyRound } from 'lucide-react';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { cn } from '@/lib/utils';
import { validatePasswordPolicy } from '@/components/auth/password-policy';

export default function PasswordResetRequiredPage() {
  const service = usePipelineService();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policyError = newPassword ? validatePasswordPolicy(newPassword) : null;
  const mismatch = newPassword !== '' && confirmPassword !== '' && newPassword !== confirmPassword;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError('Please fill in all fields.');
        return;
      }
      if (policyError) {
        setError(policyError);
        return;
      }
      if (mismatch) {
        setError('The new passwords do not match.');
        return;
      }
      setSubmitting(true);
      setError(null);
      const res = await service.본인_비밀번호를_변경한다({ currentPassword, newPassword });
      setSubmitting(false);
      if (!res.success) {
        setError(res.message || 'Failed to change password.');
        return;
      }
      router.push('/plan');
    },
    [currentPassword, newPassword, confirmPassword, policyError, mismatch, service, router],
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Activity className="w-6 h-6 text-accent" />
          <span className="text-sm font-bold tracking-tight text-foreground">SDPE Pipeline Console</span>
        </div>

        <form onSubmit={handleSubmit} className="w-full bg-card border border-border rounded-xl p-6 space-y-4 shadow-xl">
          <div className="flex items-start gap-2 bg-accent/10 border border-accent/30 rounded-md px-3 py-2">
            <KeyRound className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
            <div className="text-[11px] text-foreground leading-relaxed">
              <div className="font-semibold mb-0.5">Password change required</div>
              <div className="text-muted-foreground">You signed in with a temporary password. Please set a new password to continue.</div>
            </div>
          </div>

          <PasswordField label="Temporary Password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" disabled={submitting} />
          <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" disabled={submitting} />
          <PasswordField label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={submitting} />

          <div className="text-[10px] text-muted-foreground leading-relaxed">
            At least 12 characters. Must include at least one uppercase, lowercase, digit, and special character.
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
            Change Password
          </button>
        </form>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-muted-foreground">{label}</label>
      <input
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}
