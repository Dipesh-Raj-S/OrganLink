import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserRole, UserSession } from '../types';
import {
  getStoredSession,
  storeSession,
  clearSession,
  api,
  isMockApiEnabled,
  setMockApiEnabled,
} from '../api/client';

interface AuthContextType {
  session: UserSession | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMockMode: boolean;
  toggleApiMode: (mock: boolean) => void;
  login: (username: string, password: string) => Promise<UserSession>;
  switchRoleQuickly: (newRole: UserRole) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMockMode, setIsMockMode] = useState<boolean>(isMockApiEnabled());

  useEffect(() => {
    // Check initial session
    const stored = getStoredSession();
    if (stored) {
      setSession(stored);
    } else {
      // Default demo session for immediate exploration
      const demoSession: UserSession = {
        access_token: 'demo-init-jwt-token-coord',
        role: 'COORDINATOR',
        hospital_id: 'H-001',
        hospital_name: 'Massachusetts General Hospital',
        username: 'coordinator.jenkins',
        expires_in: 3600,
      };
      storeSession(demoSession);
      setSession(demoSession);
    }
    setIsLoading(false);

    const handleModeChange = () => {
      setIsMockMode(isMockApiEnabled());
    };
    window.addEventListener('api-mode-changed', handleModeChange);
    return () => window.removeEventListener('api-mode-changed', handleModeChange);
  }, []);

  const login = async (username: string, password: string): Promise<UserSession> => {
    const res = await api.post<UserSession>('/auth/login', { username, password });
    storeSession(res);
    setSession(res);
    return res;
  };

  const switchRoleQuickly = (newRole: UserRole) => {
    if (!session) return;
    const hospitalMapping: Record<UserRole, { id: string; name: string }> = {
      ADMIN: { id: 'H-001', name: 'Regional Organ Procurement Network HQ' },
      COORDINATOR: { id: 'H-001', name: 'Massachusetts General Hospital' },
      DOCTOR: { id: 'H-002', name: 'Johns Hopkins Hospital' },
      AUDITOR: { id: 'H-003', name: 'National Organ Oversight Commission' },
    };

    const updated: UserSession = {
      ...session,
      role: newRole,
      hospital_id: hospitalMapping[newRole].id,
      hospital_name: hospitalMapping[newRole].name,
      username: `${newRole.toLowerCase()}.operator`,
    };
    storeSession(updated);
    setSession(updated);
  };

  const logout = () => {
    clearSession();
    setSession(null);
  };

  const toggleApiMode = (mock: boolean) => {
    setMockApiEnabled(mock);
    setIsMockMode(mock);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        role: session?.role || null,
        isAuthenticated: !!session,
        isLoading,
        isMockMode,
        toggleApiMode,
        login,
        switchRoleQuickly,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
