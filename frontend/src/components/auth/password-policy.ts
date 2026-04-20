/**
 * 비밀번호 정책 (REQ-SEC-002 — 수치 TBC, 본 프로젝트 제안치)
 * - 최소 12자
 * - 대문자, 소문자, 숫자, 특수문자 각 1개 이상
 */
export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 12) return '비밀번호는 최소 12자 이상이어야 합니다.';
  if (!/[A-Z]/.test(password)) return '비밀번호에 대문자를 1개 이상 포함해야 합니다.';
  if (!/[a-z]/.test(password)) return '비밀번호에 소문자를 1개 이상 포함해야 합니다.';
  if (!/[0-9]/.test(password)) return '비밀번호에 숫자를 1개 이상 포함해야 합니다.';
  if (!/[^A-Za-z0-9]/.test(password)) return '비밀번호에 특수문자를 1개 이상 포함해야 합니다.';
  return null;
}
