'use client';

import { createContext, useContext } from 'react';

export interface AdminAuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  setAuthenticated: (token: string) => void;
  logout: () => void;
}

export const AdminAuthCtx = createContext<AdminAuthContextType>({
  isAuthenticated: false,
  token: null,
  setAuthenticated: () => {},
  logout: () => {},
});

export function useAdminAuth() {
  return useContext(AdminAuthCtx);
}
