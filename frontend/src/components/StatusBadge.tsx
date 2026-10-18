import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: 'donor' | 'recipient' | 'request' | 'allocation' | 'blood' | 'urgency';
}

const palette: Record<string, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXACT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  WAITING: 'bg-amber-50 text-amber-700 border-amber-200',
  SCHEDULED: 'bg-amber-50 text-amber-700 border-amber-200',
  IN_TRANSIT: 'bg-amber-50 text-amber-700 border-amber-200',
  MATCHED: 'bg-accent text-brand-ink border-accent-border',
  CONFIRMED: 'bg-accent text-brand-ink border-accent-border',
  COMPATIBLE: 'bg-accent text-brand-ink border-accent-border',
  ALLOCATED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  RESERVED: 'bg-violet-50 text-violet-700 border-violet-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  NORMAL: 'bg-slate-100 text-slate-600 border-slate-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  CONFLICT: 'bg-red-50 text-red-700 border-red-200',
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const normalized = status.toUpperCase();
  const colorClasses = palette[normalized] ?? 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 text-[11px] font-medium border rounded-md ${colorClasses}`}
    >
      {normalized.replace(/_/g, ' ')}
    </span>
  );
};
