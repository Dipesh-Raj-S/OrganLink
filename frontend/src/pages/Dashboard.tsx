import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { api, ApiError, isMockApiEnabled } from '../api/client';
import { DashboardStats, Recipient } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<DashboardStats>('/stats/dashboard');
      setStats(data);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (isLoading) {
    return <LoadingState message="Loading network overview..." rows={6} />;
  }

  if (error || !stats) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        <h1 className="page-title">Clinical Operations Overview</h1>
        <ErrorMessage error={error} onRetry={fetchStats} />
      </div>
    );
  }

  const kpi = (label: string, value: number, sub: string, valueClass = 'text-slate-900') => (
    <div className="card p-4">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Title & refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Clinical Operations Overview</h1>
          <p className="page-subtitle">
            Donor procurement, candidate pipelines, and critical waitlist monitors.
          </p>
        </div>
        <button type="button" onClick={fetchStats} className="btn-secondary shrink-0">
          <RotateCcw size={14} className="text-slate-400" />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpi('Total Donors', stats.total_donors, 'Registered records')}
        {kpi(
          'Available Donors',
          stats.available_donors,
          'Ready for matching',
          'text-emerald-600'
        )}
        {kpi('Active Waitlist', stats.total_recipients_waiting, 'Awaiting a match', 'text-brand-ink')}
        {kpi('Allocations', stats.confirmed_allocations, 'Confirmed transplants')}
        <div
          className={`p-4 rounded-lg border ${
            stats.donors_approaching_expiry > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <div
            className={`text-[11px] font-medium ${
              stats.donors_approaching_expiry > 0 ? 'text-red-700' : 'text-slate-500'
            }`}
          >
            Expiring (&lt;12h)
          </div>
          <div
            className={`mt-1.5 text-xl font-semibold tabular-nums ${
              stats.donors_approaching_expiry > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {stats.donors_approaching_expiry}
          </div>
          <div
            className={`mt-0.5 text-[11px] ${
              stats.donors_approaching_expiry > 0 ? 'text-red-500' : 'text-slate-400'
            }`}
          >
            Critical viability window
          </div>
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donor status breakdown */}
        <div className="card p-4 space-y-3">
          <div className="section-heading border-b border-slate-200 pb-2.5">
            Donor Status Breakdown
          </div>
          <div className="space-y-1.5 text-xs">
            {[
              { label: 'Available', value: stats.status_breakdown.available, cls: 'text-emerald-700' },
              ...(stats.status_breakdown.reserved != null
                ? [{ label: 'Reserved', value: stats.status_breakdown.reserved, cls: 'text-violet-700' }]
                : []),
              ...(stats.status_breakdown.matched != null
                ? [{ label: 'Matched (Under Review)', value: stats.status_breakdown.matched, cls: 'text-brand-ink' }]
                : []),
              { label: 'Allocated', value: stats.status_breakdown.allocated, cls: 'text-slate-700' },
              { label: 'Expired', value: stats.status_breakdown.expired, cls: 'text-red-600' },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between px-2.5 py-2 bg-slate-50 rounded-md"
              >
                <span className={row.cls}>{row.label}</span>
                <span className="font-semibold text-slate-900 tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Organ distribution */}
        <div className="card p-4 space-y-3 lg:col-span-2">
          <div className="section-heading border-b border-slate-200 pb-2.5">
            Organ &amp; Tissue Volume
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(stats.organ_breakdown).map(([organ, count]) => (
              <div key={organ} className="p-3 bg-slate-50 rounded-md">
                <div className="text-[11px] text-slate-500 capitalize truncate">{organ}</div>
                <div className="text-base font-semibold text-slate-900 mt-0.5 tabular-nums">
                  {count}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Critical waitlist table */}
      <div className="card p-0 space-y-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-slate-200">
          <div>
            <h2 className="section-heading">Critical Waitlist — Urgency Priority</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isMockApiEnabled()
                ? 'Patients with urgency score ≥ 80, prioritized by clinical severity.'
                : 'Top waiting-list patients ranked by backend clinical urgency (1-10 scale).'}
            </p>
          </div>
          <Link
            to="/recipients"
            className="text-xs font-medium text-brand-ink hover:text-navy shrink-0"
          >
            View full waitlist ({stats.total_recipients_waiting})
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-medium">Recipient</th>
                <th className="py-2.5 px-4 font-medium">Patient Name</th>
                <th className="py-2.5 px-4 font-medium">ABO</th>
                <th className="py-2.5 px-4 font-medium">Organ Needed</th>
                <th className="py-2.5 px-4 font-medium">Urgency</th>
                <th className="py-2.5 px-4 font-medium">Hospital</th>
                <th className="py-2.5 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.urgent_recipients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                    No critical recipients on the waiting list.
                  </td>
                </tr>
              )}
              {stats.urgent_recipients.map((r: Recipient) => (
                <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-4 font-medium text-brand-ink">{r.id}</td>
                  <td className="py-2.5 px-4 text-slate-800">{r.name}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{r.blood_type}</td>
                  <td className="py-2.5 px-4 text-slate-600">{r.organ_needed}</td>
                  <td className="py-2.5 px-4">
                    <span className="font-semibold text-red-600 tabular-nums">
                      {r.urgency_score} / {r.urgency_denominator === 10 ? 10 : 100}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">{r.hospital_name || r.id}</td>
                  <td className="py-2.5 px-4 text-right">
                    <Link to={`/matching/${r.id}`} className="btn-accent !py-1 !px-2.5">
                      Find Candidates
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
