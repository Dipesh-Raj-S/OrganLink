import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

export const Navbar: React.FC = () => {
  const { session, role, switchRoleQuickly, logout, isMockMode, toggleApiMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Clinical Overview';
    if (path === '/donors') return 'Donor Registry';
    if (path === '/recipients') return 'Recipient Waitlist';
    if (path === '/hospitals') return 'Hospital Infrastructure';
    if (path === '/match-requests') return 'Match Request Queue';
    if (path === '/allocations') return 'Allocation Audit Ledger';
    if (path.startsWith('/matching/')) return 'Compatibility Matching';
    if (path.startsWith('/graph/')) return 'Relational Graph Visualizer';
    if (path === '/privacy') return 'Data Protection & Privacy';
    if (path === '/terms') return 'Transplant Network Terms';
    return 'Workstation';
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    switchRoleQuickly(e.target.value as UserRole);
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between gap-6 shrink-0 z-20">
      {/* Zone 1: Brand & Breadcrumb */}
      <div className="flex items-center gap-4 min-w-0">
        <Link to="/dashboard" className="flex items-center gap-2 text-white font-mono text-sm font-bold tracking-wider shrink-0">
          <span className="w-2.5 h-2.5 bg-cyan-400 rounded-xs"></span>
          <span>ODRN WORKSTATION</span>
        </Link>
        <span className="text-slate-600 select-none">/</span>
        <span className="text-xs font-mono text-slate-300 uppercase tracking-wider truncate">
          {getBreadcrumb()}
        </span>
      </div>

      {/* Zone 2: System Status & API Mode Switch */}
      <div className="hidden lg:flex items-center gap-3">
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xs p-1 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => toggleApiMode(true)}
            className={`px-2.5 py-1 rounded-xs transition-colors ${
              isMockMode
                ? 'bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mock Engine (Active)
          </button>
          <button
            type="button"
            onClick={() => toggleApiMode(false)}
            className={`px-2.5 py-1 rounded-xs transition-colors ${
              !isMockMode
                ? 'bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            FastAPI (/api/v1)
          </button>
        </div>
      </div>

      {/* Zone 3: Quick Role Switcher, Hospital Affiliation & Logout */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:flex flex-col text-right">
          <span className="text-xs font-medium text-slate-200 truncate max-w-[180px]">
            {session?.hospital_name || 'Hospital Node'}
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            ID: {session?.hospital_id || 'H-001'}
          </span>
        </div>

        {/* Role Switcher for seamless demonstration of all 4 roles */}
        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xs px-2 py-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Role:</span>
          <select
            value={role || 'COORDINATOR'}
            onChange={handleRoleChange}
            className="bg-transparent text-xs font-mono font-semibold text-cyan-400 focus:outline-none cursor-pointer"
          >
            <option value="COORDINATOR" className="bg-slate-900 text-slate-200">COORDINATOR</option>
            <option value="DOCTOR" className="bg-slate-900 text-slate-200">DOCTOR</option>
            <option value="ADMIN" className="bg-slate-900 text-slate-200">ADMIN</option>
            <option value="AUDITOR" className="bg-slate-900 text-slate-200">AUDITOR</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="px-3 py-1.5 text-xs font-mono font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xs transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
};
