import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserRole, UserSession } from '../types';
import {
  getStoredSession,
  storeSession,
  clearSession,
  api,
  isMockApiEnabled,
  setMockApiEnabled,
  SESSION_EXPIRED_EVENT,
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

async function hydrateSessionFromBackend(): Promise<UserSession | null> {
  try {
    const token = localStorage.getItem('organ_network_access_token');
    if (!token) {
      return null;
    }

    const me = await api.get<{ user_id: string; username: string; role: UserRole; hospital_id?: string | null }>(
      '/auth/me'
    );

    const hospitalId = me.hospital_id || 'UNKNOWN';
    // The backend HospitalResponse key for the identifier is `hospital_id`
    // (verified against backend/app/schemas/hospital.py).
    const hospital = hospitalId !== 'UNKNOWN'
      ? await api.get<{ hospital_id: string; name: string }>(`/hospitals/${hospitalId}`).catch(() => null)
      : null;

    return {
      access_token: token,
      role: me.role,
      hospital_id: hospitalId,
      hospital_name: hospital?.name || hospitalId,
      username: me.username,
      expires_in: 3600,
    };
  } catch {
    clearSession();
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMockMode, setIsMockMode] = useState<boolean>(isMockApiEnabled());

  useEffect(() => {
    const hydrate = async () => {
      const stored = getStoredSession();

      if (!stored) {
        setSession(null);
        setIsLoading(false);
        return;
      }

      if (isMockApiEnabled()) {
        setSession(stored);
        setIsLoading(false);
        return;
      }

      try {
        const liveSession = await hydrateSessionFromBackend();
        setSession(liveSession);
      } catch {
        setSession(null);
      } finally {
        setIsLoading(false);
      }
    };

    hydrate();

    const handleModeChange = () => {
      setIsMockMode(isMockApiEnabled());
    };
    window.addEventListener('api-mode-changed', handleModeChange);

    // A live HTTP 401 (expired/invalid bearer token) clears the session and
    // forces a login redirect through ProtectedRoute.
    const handleSessionExpired = () => {
      clearSession();
      setSession(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      window.removeEventListener('api-mode-changed', handleModeChange);
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  const login = async (username: string, password: string): Promise<UserSession> => {
    const tokenResponse = await api.post<{ access_token: string; expires_in?: number; token_type?: string }>(
      '/auth/login',
      { username, password }
    );

    localStorage.setItem('organ_network_access_token', tokenResponse.access_token);

    // Mock tokens must never be validated against the live backend.
    if (isMockApiEnabled()) {
      const mockSession = getStoredSession();
      if (mockSession) {
        storeSession(mockSession);
        setSession(mockSession);
        return mockSession;
      }
      const fallbackMock: UserSession = {
        access_token: tokenResponse.access_token,
        role: 'COORDINATOR',
        hospital_id: 'UNKNOWN',
        hospital_name: 'Unknown Hospital',
        username,
        expires_in: tokenResponse.expires_in || 3600,
      };
      storeSession(fallbackMock);
      setSession(fallbackMock);
      return fallbackMock;
    }

    const nextSession = await hydrateSessionFromBackend();
    if (!nextSession) {
      const fallback: UserSession = {
        access_token: tokenResponse.access_token,
        role: 'COORDINATOR',
        hospital_id: 'UNKNOWN',
        hospital_name: 'Unknown Hospital',
        username,
        expires_in: tokenResponse.expires_in || 3600,
      };
      storeSession(fallback);
      setSession(fallback);
      return fallback;
    }

    const liveSession: UserSession = {
      ...nextSession,
      access_token: tokenResponse.access_token,
      expires_in: tokenResponse.expires_in || nextSession.expires_in,
    };

    storeSession(liveSession);
    setSession(liveSession);
    return liveSession;
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

    if (!mock) {
      clearSession();
      setSession(null);
    }
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
