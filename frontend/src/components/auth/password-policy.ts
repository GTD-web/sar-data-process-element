/**
 * 비밀번호 정책 (REQ-SEC-002 — 수치 TBC, 본 프로젝트 제안치)
 * - 최소 12자
 * - 대문자, 소문자, 숫자, 특수문자 각 1개 이상
 */
export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one digit.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least one special character.';
  return null;
}
