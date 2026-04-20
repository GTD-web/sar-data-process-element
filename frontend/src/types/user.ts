export type Role = 'Administrator' | 'Operator';

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  requiresPasswordReset: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
  expiresAt: string;
}

export interface UserListQuery {
  search?: string;
  role?: Role | '';
  active?: boolean | '';
  page?: number;
  size?: number;
  sortBy?: keyof User;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateUserRequest {
  username: string;
  email: string;
  role: Role;
  password: string;
}

export interface UpdateUserRequest {
  email?: string;
  role?: Role;
  active?: boolean;
}
