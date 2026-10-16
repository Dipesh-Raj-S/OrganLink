import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { DashboardStats, Recipient } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../auth/AuthContext';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);
  const { role } = useAuth();

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
    return <LoadingState message="Querying live network dashboard telemetry..." rows={6} />;
  }

  if (error || !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
          Clinical Operations Dashboard
        </h1>
        <ErrorMessage error={error} onRetry={fetchStats} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Quick Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
            Clinical Operations Overview
          </h1>
          <p className="text-xs text-slate-400 font-sans">
            Real-time donor procurement telemetry, algorithmic candidate pipelines, and critical waitlist monitors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchStats}
            className="px-3 py-1.5 text-xs font-mono font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metric Strips */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Donors */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xs">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Total Donors</div>
          <div className="mt-2 text-2xl font-mono font-bold text-white tabular-nums">
            {stats.total_donors}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-mono">Registered records</div>
        </div>

        {/* Card 2: Available Donors */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xs">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Available Donors</div>
          <div className="mt-2 text-2xl font-mono font-bold text-emerald-400 tabular-nums">
            {stats.available_donors}
          </div>
          <div className="mt-1 text-[11px] text-emerald-500/80 font-mono">Ready for matching</div>
        </div>

        {/* Card 3: Total Recipients Waiting */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xs">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Active Waitlist</div>
          <div className="mt-2 text-2xl font-mono font-bold text-cyan-400 tabular-nums">
            {stats.total_recipients_waiting}
          </div>
          <div className="mt-1 text-[11px] text-cyan-500/80 font-mono">Awaiting organ match</div>
        </div>

        {/* Card 4: Confirmed Allocations */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xs">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Allocations</div>
          <div className="mt-2 text-2xl font-mono font-bold text-slate-200 tabular-nums">
            {stats.confirmed_allocations}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 font-mono">Confirmed transplants</div>
        </div>

        {/* Card 5: Donors Approaching Expiry */}
        <div className={`p-4 rounded-xs border ${
          stats.donors_approaching_expiry > 0
            ? 'bg-red-950/40 border-red-800/80'
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="text-[11px] font-mono text-red-400 uppercase tracking-wider font-semibold">
            Expiring (&lt;12h)
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-red-400 tabular-nums">
            {stats.donors_approaching_expiry}
          </div>
          <div className="mt-1 text-[11px] text-red-400/80 font-mono">Critical viability window</div>
        </div>
      </div>

      {/* Secondary Status Breakdown & Organ Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donor Status Breakdown */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xs space-y-3">
          <div className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
            Donor Registry Status Breakdown
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2 bg-slate-950 border border-slate-850 rounded-xs">
              <span className="text-emerald-400">AVAILABLE</span>
              <span className="font-bold text-white tabular-nums">{stats.status_breakdown.available}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-slate-950 border border-slate-850 rounded-xs">
              <span className="text-cyan-400">MATCHED (Under Review)</span>
              <span className="font-bold text-white tabular-nums">{stats.status_breakdown.matched}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-slate-950 border border-slate-850 rounded-xs">
              <span className="text-slate-300">ALLOCATED</span>
              <span className="font-bold text-white tabular-nums">{stats.status_breakdown.allocated}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-slate-950 border border-slate-850 rounded-xs">
              <span className="text-red-400">EXPIRED</span>
              <span className="font-bold text-white tabular-nums">{stats.status_breakdown.expired}</span>
            </div>
          </div>
        </div>

        {/* Organ Type Breakdown */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xs space-y-3 lg:col-span-2">
          <div className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
            Procured Organ & Tissue Volume
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            {Object.entries(stats.organ_breakdown).map(([organ, count]) => (
              <div key={organ} className="p-3 bg-slate-950 border border-slate-800 rounded-xs">
                <div className="text-[11px] text-slate-400 truncate">{organ}</div>
                <div className="text-lg font-bold text-cyan-400 mt-1 tabular-nums">{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Critical Waitlist High-Priority Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xs p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Critical Urgency Recipients Requiring Matching
            </h2>
            <p className="text-[11px] text-slate-400 font-sans">
              Patients with urgency score &ge; 80 prioritized by clinical severity.
            </p>
          </div>
          <Link
            to="/recipients"
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline underline-offset-4"
          >
            View Full Waitlist ({stats.total_recipients_waiting})
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-950 font-mono text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Recipient ID</th>
                <th className="py-2.5 px-3">Patient Name</th>
                <th className="py-2.5 px-3">ABO</th>
                <th className="py-2.5 px-3">Organ Needed</th>
                <th className="py-2.5 px-3">Urgency Score</th>
                <th className="py-2.5 px-3">Hospital Center</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {stats.urgent_recipients.map((r: Recipient) => (
                <tr key={r.id} className="hover:bg-slate-850/50 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-cyan-400">{r.id}</td>
                  <td className="py-2.5 px-3 text-slate-200 font-sans font-medium">{r.name}</td>
                  <td className="py-2.5 px-3 font-bold text-white">{r.blood_type}</td>
                  <td className="py-2.5 px-3 text-slate-300">{r.organ_needed}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-red-400 tabular-nums">{r.urgency_score} / 100</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-sans">{r.hospital_name}</td>
                  <td className="py-2.5 px-3 text-right">
                    <Link
                      to={`/matching/${r.id}`}
                      className="inline-block px-2.5 py-1 text-[11px] font-mono font-semibold bg-cyan-900/80 hover:bg-cyan-800 text-cyan-200 border border-cyan-600 rounded-xs transition-colors"
                    >
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
