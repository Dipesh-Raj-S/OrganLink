import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';
import { UserRole } from '../types';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('coordinator_sarah');
  const [password, setPassword] = useState('CoordPass!2026');
  const [selectedRolePreset, setSelectedRolePreset] = useState<UserRole>('COORDINATOR');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const applyPreset = (role: UserRole) => {
    setSelectedRolePreset(role);
    switch (role) {
      case 'ADMIN':
        setUsername('admin_sys');
        setPassword('AdminSecurePass!2026');
        break;
      case 'COORDINATOR':
        setUsername('coordinator_sarah');
        setPassword('CoordPass!2026');
        break;
      case 'DOCTOR':
        setUsername('dr_chen_transplant');
        setPassword('DoctorPass!2026');
        break;
      case 'AUDITOR':
        setUsername('auditor_james');
        setPassword('AuditPass!2026');
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-accent-strong via-accent to-page">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 bg-navy rounded-md flex items-center justify-center">
            <span className="w-2 h-2 bg-accent rounded-sm"></span>
          </span>
          <div>
            <div className="text-sm font-semibold text-navy leading-tight">OrganLink</div>
            <div className="text-[11px] text-slate-500 leading-tight">
              Donor–Recipient Matching Network
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-500">Clinical Gateway · API v1.0</div>
      </header>

      {/* Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-8 space-y-6">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-navy">Sign in</h1>
            <p className="text-xs text-slate-500">
              Use your institutional credentials to access matching records.
            </p>
          </div>

          <ErrorMessage error={error} />

          {/* Quick preset selector for demonstration */}
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-slate-600">
              Demo credential profiles
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['COORDINATOR', 'DOCTOR', 'ADMIN', 'AUDITOR'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => applyPreset(r)}
                  className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-colors flex items-center justify-between ${
                    selectedRolePreset === r
                      ? 'bg-accent border-accent-border text-navy'
                      : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span>{r}</span>
                  {selectedRolePreset === r && (
                    <span className="w-1.5 h-1.5 bg-brand rounded-full" aria-label="Selected" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 pt-4 space-y-4">
            <div>
              <label htmlFor="login-username" className="label">
                Username / Institutional ID
              </label>
              <input
                id="login-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. coordinator.jenkins"
                autoComplete="username"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="label">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="input"
              />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full !py-2 text-sm">
              {isLoading && (
                <span className="w-3.5 h-3.5 border-2 border-accent-border border-t-white rounded-full animate-spin"></span>
              )}
              <span>{isLoading ? 'Signing in...' : 'Sign in'}</span>
            </button>
          </form>

          <div className="pt-1 border-t border-slate-200 text-[11px] text-slate-400 space-y-0.5">
            <div>Auth endpoint: POST /api/v1/auth/login</div>
            <div>Token: Authorization Bearer &lt;access_token&gt;</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
        <div>Clinical Data Protection Protocol</div>
        <div className="flex gap-4">
          <a href="/privacy" className="hover:text-navy">
            Privacy Policy
          </a>
          <a href="/terms" className="hover:text-navy">
            Terms of Service
          </a>
        </div>
      </footer>
    </div>
  );
};
