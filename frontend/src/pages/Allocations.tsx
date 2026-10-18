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
  const maskName = (name: string | undefined, id: string) => {
    if (!isAuditor) return name || id;
    if (!name) return `*** [${id}]`;
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}. ${parts[1][0]}*** [${id.replace('-', '‑***')}]`;
    }
    return `${name.substring(0, 2)}*** (${id})`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Audit Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-navy">
            Transplant Allocation Audit Ledger
          </h1>
          <p className="text-xs text-slate-500 font-sans">
            Cryptographically sealed, append-only historical audit records of executed organ and blood transfers.
          </p>
        </div>

        {isAuditor && (
          <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md text-xs text-amber-700 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-md"></span>
            <span>Auditor protocol: PHI masking active</span>
          </div>
        )}
      </div>

      <ErrorMessage error={error} onRetry={fetchAllocations} />

      {isLoading ? (
        <LoadingState message="Verifying allocation audit signatures..." rows={5} />
      ) : allocations.length === 0 ? (
        <div className="py-12 text-center bg-white border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500">No completed allocations recorded in ledger</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-50 text-[11px] font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100 ">
                {allocations.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-brand-ink">{a.id}</td>
                    <td className="py-2.5 px-3 font-sans">
                      <div className="text-slate-800 font-semibold">
                        {maskName(a.donor_name, a.donor_id)}
                      </div>
                      <div className="text-[11px] text-slate-500 ">
                        {isAuditor ? 'ID: [REDACTED]' : `ID: ${a.donor_id}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <div className="text-slate-800 font-semibold">
                        {maskName(a.recipient_name, a.recipient_id)}
                      </div>
                      <div className="text-[11px] text-slate-500 ">
                        {isAuditor ? 'ID: [REDACTED]' : `ID: ${a.recipient_id}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 font-medium">
                      {a.organ_type || <span className="text-slate-600 ">From donor {a.donor_id}</span>}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {a.blood_type || <span className="text-slate-600 ">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                      <div>{a.confirming_hospital_name}</div>
                      <div className="text-[11px] text-slate-500 ">ID: {a.confirming_hospital_id}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px] tabular-nums">
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

          <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <div>
              Total Audit Records: <span className="text-slate-900 font-semibold">{total}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              * Historical immutable ledger. Modification and deletion prohibited under procurement regulations.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
