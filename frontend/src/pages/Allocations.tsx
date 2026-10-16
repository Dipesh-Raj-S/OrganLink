import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../api/client';
import { Allocation, PaginatedResponse } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../auth/AuthContext';

export const Allocations: React.FC = () => {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);

  const { role } = useAuth();
  const isAuditor = role === 'AUDITOR';

  const fetchAllocations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedResponse<Allocation>>('/allocations', { page_size: 50 });
      setAllocations(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
  }, []);

  // Helper to mask PHI for Auditor role as required by HIPAA/Auditor spec
  const maskName = (name: string, id: string) => {
    if (!isAuditor) return name;
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}. ${parts[1][0]}*** [${id.replace('-', '‑***')}]`;
    }
    return `${name.substring(0, 2)}*** (${id})`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Audit Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
            Transplant Allocation Audit Ledger
          </h1>
          <p className="text-xs text-slate-400 font-sans">
            Cryptographically sealed, append-only historical audit records of executed organ and blood transfers.
          </p>
        </div>

        {isAuditor && (
          <div className="bg-amber-950/60 border border-amber-700/80 px-3 py-1.5 rounded-xs text-xs font-mono text-amber-300 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-xs"></span>
            <span>AUDITOR PROTOCOL: PHI MASKING ACTIVE</span>
          </div>
        )}
      </div>

      <ErrorMessage error={error} onRetry={fetchAllocations} />

      {isLoading ? (
        <LoadingState message="Verifying allocation audit signatures..." rows={5} />
      ) : allocations.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xs">
          <p className="text-xs font-mono text-slate-400 uppercase">No completed allocations recorded in ledger</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-950 font-mono text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Allocation ID</th>
                  <th className="py-2.5 px-3">Donor Source</th>
                  <th className="py-2.5 px-3">Recipient Target</th>
                  <th className="py-2.5 px-3">Organ / Graft</th>
                  <th className="py-2.5 px-3">ABO Profile</th>
                  <th className="py-2.5 px-3">Confirming Hospital Center</th>
                  <th className="py-2.5 px-3">Confirmation Date & Time</th>
                  <th className="py-2.5 px-3 text-right">Transfer Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {allocations.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-cyan-400">{a.id}</td>
                    <td className="py-2.5 px-3 font-sans">
                      <div className="text-slate-200 font-semibold">
                        {maskName(a.donor_name, a.donor_id)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {isAuditor ? 'ID: [REDACTED]' : `ID: ${a.donor_id}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <div className="text-slate-200 font-semibold">
                        {maskName(a.recipient_name, a.recipient_id)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {isAuditor ? 'ID: [REDACTED]' : `ID: ${a.recipient_id}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-semibold">{a.organ_type}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{a.blood_type}</td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      <div>{a.confirming_hospital_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {a.confirming_hospital_id}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 text-[11px] tabular-nums">
                      {new Date(a.confirmation_date).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <StatusBadge status={a.transplant_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <div>
              Total Audit Records: <span className="text-white font-bold">{total}</span>
            </div>
            <div className="text-[11px] text-slate-400">
              * Historical immutable ledger. Modification and deletion prohibited under procurement regulations.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
