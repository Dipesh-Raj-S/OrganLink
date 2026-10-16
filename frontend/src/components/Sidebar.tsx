import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

export const Sidebar: React.FC = () => {
  const { role } = useAuth();

  const handleReset = () => {
    if (window.confirm('Reset local mock database to initial seed data?')) {
      api.resetMockData();
      window.location.reload();
    }
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between px-3.5 py-2 text-xs font-mono tracking-wide rounded-xs transition-colors ${
      isActive
        ? 'bg-slate-800 text-white font-semibold border-l-2 border-cyan-400 pl-3'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
    }`;

  return (
    <aside className="w-60 bg-slate-950 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
      <div className="p-4 space-y-6">
        {/* Terminal Header */}
        <div className="border-b border-slate-800 pb-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
            Transplant Network
          </div>
          <div className="text-xs font-semibold text-white tracking-wide mt-0.5">
            Organ & Blood Exchange
          </div>
        </div>

        {/* Navigation Section */}
        <nav className="space-y-1">
          <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-widest text-slate-400">
            Operations
          </div>

          <NavLink to="/dashboard" className={navItemClass}>
            <span>Dashboard</span>
            <span className="text-[10px] text-slate-400 font-mono">01</span>
          </NavLink>

          {/* Donors: visible to ADMIN, COORDINATOR, DOCTOR */}
          {(role === 'ADMIN' || role === 'COORDINATOR' || role === 'DOCTOR') && (
            <NavLink to="/donors" className={navItemClass}>
              <span>Donors</span>
              <span className="text-[10px] text-slate-400 font-mono">02</span>
            </NavLink>
          )}

          {/* Recipients: visible to ADMIN, COORDINATOR, DOCTOR */}
          {(role === 'ADMIN' || role === 'COORDINATOR' || role === 'DOCTOR') && (
            <NavLink to="/recipients" className={navItemClass}>
              <span>Recipients</span>
              <span className="text-[10px] text-slate-400 font-mono">03</span>
            </NavLink>
          )}

          {/* Hospitals: visible ONLY to ADMIN as required */}
          {role === 'ADMIN' && (
            <NavLink to="/hospitals" className={navItemClass}>
              <span>Hospitals</span>
              <span className="text-[10px] text-cyan-500 font-mono">ADMIN</span>
            </NavLink>
          )}

          {/* Match Requests: visible to ADMIN, COORDINATOR, DOCTOR */}
          {(role === 'ADMIN' || role === 'COORDINATOR' || role === 'DOCTOR') && (
            <NavLink to="/match-requests" className={navItemClass}>
              <span>Match Requests</span>
              <span className="text-[10px] text-slate-400 font-mono">04</span>
            </NavLink>
          )}

          {/* Allocations: visible to all roles including AUDITOR */}
          <NavLink to="/allocations" className={navItemClass}>
            <span>Allocation Ledger</span>
            <span className="text-[10px] text-slate-400 font-mono">05</span>
          </NavLink>
        </nav>

        {/* Compliance & Policy Links */}
        <div className="pt-2 space-y-1 border-t border-slate-900">
          <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-widest text-slate-400">
            Governance
          </div>
          <NavLink to="/privacy" className={navItemClass}>
            <span>Privacy Policy</span>
          </NavLink>
          <NavLink to="/terms" className={navItemClass}>
            <span>Terms of Use</span>
          </NavLink>
        </div>
      </div>

      {/* Footer Utility */}
      <div className="p-4 border-t border-slate-800 space-y-3">
        <button
          type="button"
          onClick={handleReset}
          className="w-full py-1.5 px-3 text-[11px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xs transition-colors text-left flex items-center justify-between"
        >
          <span>Reset Demo Store</span>
          <span className="text-[10px] text-slate-400">DB</span>
        </button>

        <div className="text-[10px] font-mono text-slate-400 flex flex-col gap-0.5">
          <div>FastAPI Spec: v1.0.4</div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
            <span>Neo4j Graph Ready</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
