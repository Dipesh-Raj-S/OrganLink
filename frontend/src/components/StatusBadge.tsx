import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: 'donor' | 'recipient' | 'request' | 'allocation' | 'blood' | 'urgency';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const normalized = status.toUpperCase();

  // Surgical high-contrast styling: rectangular, subtle border, strictly non-pill
  let colorClasses = 'bg-slate-900 border-slate-700 text-slate-300';

  switch (normalized) {
    case 'AVAILABLE':
    case 'COMPLETED':
    case 'EXACT':
      colorClasses = 'bg-emerald-950/70 border-emerald-700/80 text-emerald-300';
      break;
    case 'CANCELLED':
    case 'EXPIRED':
    case 'REJECTED':
    case 'CONFLICT':
    case 'CRITICAL':
      colorClasses = 'bg-red-950/70 border-red-700/80 text-red-300';
      break;
    case 'PENDING':
    case 'WAITING':
    case 'SCHEDULED':
    case 'IN_TRANSIT':
      colorClasses = 'bg-amber-950/70 border-amber-700/80 text-amber-300';
      break;
    case 'MATCHED':
    case 'CONFIRMED':
    case 'COMPATIBLE':
      colorClasses = 'bg-cyan-950/70 border-cyan-700/80 text-cyan-300';
      break;
    case 'ALLOCATED':
      colorClasses = 'bg-indigo-950/70 border-indigo-700/80 text-indigo-300';
      break;
    case 'RESERVED':
      colorClasses = 'bg-violet-950/70 border-violet-700/80 text-violet-300';
      break;
    case 'EXPIRED':
    case 'REJECTED':
    case 'CONFLICT':
    case 'CRITICAL':
      colorClasses = 'bg-red-950/70 border-red-700/80 text-red-300';
      break;
    case 'HIGH':
      colorClasses = 'bg-orange-950/70 border-orange-700/80 text-orange-300';
      break;
    case 'NORMAL':
      colorClasses = 'bg-slate-900 border-slate-700 text-slate-300';
      break;
    default:
      colorClasses = 'bg-slate-900 border-slate-700 text-slate-300';
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono tracking-wider font-semibold border rounded-xs ${colorClasses}`}
    >
      {status}
    </span>
  );
};
