'use client';

import { useCallback, useEffect, useState } from 'react';

export type MockRole = 'Administrator' | 'Operator';

const STORAGE_KEY = 'sdpe.mockRole';

function isMockRole(value: string | null): value is MockRole {
  return value === 'Administrator' || value === 'Operator';
}

export function useMockRole(): [MockRole, (role: MockRole) => void] {
  const [role, setRoleState] = useState<MockRole>(() => {
    if (typeof window === 'undefined') return 'Administrator';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isMockRole(stored) ? stored : 'Administrator';
  });

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isMockRole(event.newValue)) {
        setRoleState(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setRole = useCallback((nextRole: MockRole) => {
    setRoleState(nextRole);
    window.localStorage.setItem(STORAGE_KEY, nextRole);
  }, []);

  return [role, setRole];
}

export function RolePreviewSelect({
  role,
  onChange,
}: {
  role: MockRole;
  onChange: (role: MockRole) => void;
}) {
  return (
    <select
      value={role}
      onChange={(e) => onChange(e.target.value as MockRole)}
      className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      title="목업 권한 미리보기"
    >
      <option value="Administrator">Administrator</option>
      <option value="Operator">Operator</option>
    </select>
  );
}
