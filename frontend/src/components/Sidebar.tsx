import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  HeartPulse,
  Users,
  Building2,
  ClipboardList,
  Receipt,
  ShieldCheck,
  ScrollText,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

const itemBase =
  'flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md transition-colors';
const itemClass = ({ isActive }: { isActive: boolean }) =>
  `${itemBase} ${
    isActive
      ? 'bg-white/10 text-white font-medium'
      : 'text-slate-300 hover:text-white hover:bg-white/5'
  }`;

const sectionLabel =
  'px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400';

interface NavItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, label, icon, adminOnly }) => (
  <NavLink to={to} className={itemClass}>
    {icon}
    <span className="flex-1 truncate">{label}</span>
    {adminOnly && (
      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-white/10 text-slate-300">
        Admin
      </span>
    )}
  </NavLink>
);

export const Sidebar: React.FC = () => {
  const { role } = useAuth();

  const handleReset = () => {
    if (window.confirm('Reset local mock database to initial seed data?')) {
      api.resetMockData();
      window.location.reload();
    }
  };

  const canSeeRegistry = role === 'ADMIN' || role === 'COORDINATOR' || role === 'DOCTOR';

  return (
    <aside className="w-56 bg-navy border-r border-navy-dark flex flex-col justify-between shrink-0 select-none">
      <div className="p-3 space-y-5">
        {/* Brand */}
        <div className="px-2 pt-2 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-brand rounded-sm" aria-hidden="true"></span>
            <span className="text-sm font-semibold text-white tracking-tight">OrganLink</span>
          </div>
          <div className="mt-0.5 px-[18px] text-[11px] text-slate-400">
            Organ &amp; Blood Exchange
          </div>
        </div>

        {/* Operations */}
        <nav className="space-y-0.5">
          <div className={sectionLabel}>Operations</div>
          <NavItem
            to="/dashboard"
            label="Dashboard"
            icon={<LayoutDashboard size={16} className="text-slate-400" />}
          />
          {canSeeRegistry && (
            <NavItem
              to="/donors"
              label="Donors"
              icon={<HeartPulse size={16} className="text-slate-400" />}
            />
          )}
          {canSeeRegistry && (
            <NavItem
              to="/recipients"
              label="Recipients"
              icon={<Users size={16} className="text-slate-400" />}
            />
          )}
          {role === 'ADMIN' && (
            <NavItem
              to="/hospitals"
              label="Hospitals"
              icon={<Building2 size={16} className="text-slate-400" />}
              adminOnly
            />
          )}
          {canSeeRegistry && (
            <NavItem
              to="/match-requests"
              label="Match Requests"
              icon={<ClipboardList size={16} className="text-slate-400" />}
            />
          )}
          <NavItem
            to="/allocations"
            label="Allocation Ledger"
            icon={<Receipt size={16} className="text-slate-400" />}
          />
        </nav>

        {/* Governance */}
        <div className="space-y-0.5">
          <div className={sectionLabel}>Governance</div>
          <NavItem
            to="/privacy"
            label="Privacy Policy"
            icon={<ShieldCheck size={16} className="text-slate-400" />}
          />
          <NavItem
            to="/terms"
            label="Terms of Use"
            icon={<ScrollText size={16} className="text-slate-400" />}
          />
        </div>
      </div>

      {/* Footer utility */}
      <div className="p-3 border-t border-white/10 space-y-3">
        <button
          type="button"
          onClick={handleReset}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/5 rounded-md border border-white/10 transition-colors"
        >
          <span className="flex items-center gap-2">
            <RotateCcw size={14} className="text-slate-400" />
            <span>Reset Demo Store</span>
          </span>
          <span className="text-[10px] text-slate-400">Mock DB</span>
        </button>

        <div className="px-2 text-[11px] text-slate-400 flex flex-col gap-1">
          <div>FastAPI Spec: v1.0.4</div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
            <span>Neo4j Graph Ready</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
