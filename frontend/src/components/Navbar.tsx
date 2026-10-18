import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

export const Navbar: React.FC<{ onToggleSidebar?: () => void }> = ({ onToggleSidebar }) => {
  const { session, role, switchRoleQuickly, logout, isMockMode, toggleApiMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/donors') return 'Donors';
    if (path === '/recipients') return 'Recipients';
    if (path === '/hospitals') return 'Hospitals';
    if (path === '/match-requests') return 'Match Requests';
    if (path === '/allocations') return 'Allocations';
    if (path.startsWith('/matching/')) return 'Matching';
    if (path.startsWith('/graph/')) return 'Graph View';
    if (path === '/privacy') return 'Privacy Policy';
    if (path === '/terms') return 'Terms of Use';
    return 'Workstation';
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    switchRoleQuickly(e.target.value as UserRole);
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
      {/* Zone 1: Brand & Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation"
            className="lg:hidden p-2 -ml-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <Menu size={18} />
          </button>
        )}
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-navy font-semibold text-sm tracking-tight shrink-0"
        >
          <span className="w-2.5 h-2.5 bg-navy rounded-sm" aria-hidden="true"></span>
          <span>OrganLink</span>
        </Link>
        <span className="text-slate-300 select-none hidden sm:inline">/</span>
        <span className="hidden sm:inline text-xs text-slate-500 truncate">
          {getBreadcrumb()}
        </span>
      </div>

      {/* Zone 2: Data Source (Mock / Live API) */}
      <div className="hidden lg:flex items-center">
        <div className="flex items-center bg-slate-100 rounded-md p-1 text-xs">
          <button
            type="button"
            onClick={() => toggleApiMode(true)}
            className={`px-3 py-1 rounded-sm transition-colors ${
              isMockMode ? 'bg-white text-navy font-medium shadow-xs' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Mock
          </button>
          <button
            type="button"
            onClick={() => toggleApiMode(false)}
            className={`px-3 py-1 rounded-sm transition-colors ${
              !isMockMode ? 'bg-white text-navy font-medium shadow-xs' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Live API
          </button>
        </div>
      </div>

      {/* Zone 3: Role Switcher, Hospital & Logout */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:flex flex-col text-right">
          <span className="text-xs font-medium text-slate-800 truncate max-w-[180px]">
            {session?.hospital_name || 'Hospital Node'}
          </span>
          <span className="text-[11px] text-slate-400">ID: {session?.hospital_id || 'H-001'}</span>
        </div>

        <div className="flex items-center gap-1.5 border border-slate-300 rounded-md px-2 py-1 bg-white">
          <label htmlFor="navbar-role" className="text-[11px] text-slate-400">
            Role
          </label>
          <select
            id="navbar-role"
            value={role || 'COORDINATOR'}
            onChange={handleRoleChange}
            className="bg-transparent text-xs font-medium text-brand-ink focus:outline-none cursor-pointer"
          >
            <option value="COORDINATOR" className="bg-white text-slate-800">COORDINATOR</option>
            <option value="DOCTOR" className="bg-white text-slate-800">DOCTOR</option>
            <option value="ADMIN" className="bg-white text-slate-800">ADMIN</option>
            <option value="AUDITOR" className="bg-white text-slate-800">AUDITOR</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="btn-secondary !px-2.5 !py-1.5 hidden sm:inline-flex items-center gap-1.5"
        >
          <LogOut size={14} className="text-slate-400" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};
