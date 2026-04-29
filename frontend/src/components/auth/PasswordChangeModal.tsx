'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { usePipelineService } from '@/app/(planning)/_context/pipeline-service-context';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { validatePasswordPolicy } from './password-policy';

export default function PasswordChangeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const service = usePipelineService();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError('Please fill in all fields.');
        return;
      }
      const policyError = validatePasswordPolicy(newPassword);
      if (policyError) {
        setError(policyError);
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match.');
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
      toast.success('Password changed');
      reset();
      onClose();
    },
    [currentPassword, newPassword, confirmPassword, service, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-96 bg-card border border-border rounded-lg shadow-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Change Password</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors"
            disabled={submitting}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        <PasswordRow label="Current Password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
        <PasswordRow label="New Password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
        <PasswordRow label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />

        <div className="text-[10px] text-muted-foreground leading-relaxed">
          At least 12 characters. Must include at least one uppercase, lowercase, digit, and special character.
        </div>

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
            Cancel
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
            Change
          </button>
        </div>
      </form>
    </div>
  );
}

function PasswordRow({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-muted-foreground">{label}</label>
      <input
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}
