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
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-6">
      <div className="flex items-center justify-between border-b border-slate-900 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-cyan-400 rounded-xs"></div>
          <span className="font-mono text-sm font-bold text-white tracking-wider">
            ORGAN & BLOOD DONOR-RECIPIENT MATCHING NETWORK
          </span>
        </div>
        <div className="font-mono text-xs text-slate-400">
          CLINICAL GATEWAY · REST API v1.0
        </div>
      </div>

      <div className="flex items-center justify-center py-12">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xs p-8 shadow-2xl space-y-6">
          <div className="space-y-1">
            <h1 className="text-lg font-mono font-bold text-white uppercase tracking-wider">
              Operator Authentication
            </h1>
            <p className="text-xs text-slate-400 font-sans">
              Sign in with institutional credentials to access matching records.
            </p>
          </div>

          <ErrorMessage error={error} />

          {/* Quick Preset Selector for Demonstration */}
          <div className="space-y-2">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Fast Demo Credential Profiles:
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['COORDINATOR', 'DOCTOR', 'ADMIN', 'AUDITOR'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => applyPreset(r)}
                  className={`px-3 py-1.5 text-xs font-mono font-semibold border rounded-xs transition-colors text-left flex items-center justify-between ${
                    selectedRolePreset === r
                      ? 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span>{r}</span>
                  {selectedRolePreset === r && <span className="text-[10px] text-cyan-400">ACTIVE</span>}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Username / Institutional ID
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. coordinator.jenkins"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-2 text-xs text-white outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-2 text-xs text-white outline-none font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-xs font-mono font-bold tracking-wider uppercase bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 rounded-xs transition-colors flex items-center justify-center gap-2"
            >
              {isLoading && (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
              )}
              <span>{isLoading ? 'Verifying Credentials...' : 'Authenticate & Enter Network'}</span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono space-y-1">
            <div>Auth Endpoint: POST /api/v1/auth/login</div>
            <div>Token Format: Authorization: Bearer &lt;access_token&gt;</div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-900 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 font-mono">
        <div>Clinical Data Protection Protocol · Non-Vibecoded Workstation</div>
        <div className="flex gap-4">
          <a href="/privacy" className="hover:text-slate-300">Privacy Policy</a>
          <span className="text-slate-800">|</span>
          <a href="/terms" className="hover:text-slate-300">Terms of Service</a>
        </div>
      </div>
    </div>
  );
};
