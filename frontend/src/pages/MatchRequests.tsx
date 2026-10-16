import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { MatchRequest, PaginatedResponse } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RoleGuard } from '../auth/RoleGuard';

export const MatchRequests: React.FC = () => {
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);

  // Confirmation & Rejection states
  const [confirmingRequest, setConfirmingRequest] = useState<MatchRequest | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<MatchRequest | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [selectedDetails, setSelectedDetails] = useState<MatchRequest | null>(null);

  // 409 Conflict Banner state
  const [conflictAlert, setConflictAlert] = useState<{
    message: string;
    code: string;
  } | null>(null);

  const location = useLocation();
  const highlightId = (location.state as any)?.highlightId;

  const fetchRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | undefined> = {
        page_size: 50,
      };
      if (statusFilter) params.status = statusFilter;

      const res = await api.get<PaginatedResponse<MatchRequest>>('/match-requests', params);
      setRequests(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleConfirmAction = async () => {
    if (!confirmingRequest) return;
    setIsProcessing(true);
    setError(null);
    setConflictAlert(null);

    try {
      await api.post(`/match-requests/${confirmingRequest.id}/confirm`);
      setConfirmingRequest(null);
      await fetchRequests();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        // Backend HTTP 409 Conflict requirement:
        // "If the backend returns HTTP 409 because another hospital has already allocated the donor, show a clear message and refresh the data."
        setConflictAlert({
          code: err.code,
          message: err.message || 'Donor is no longer available. Another hospital has completed allocation.',
        });
        setConfirmingRequest(null);
        await fetchRequests();
      } else {
        setError(err);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectAction = async () => {
    if (!rejectingRequest) return;
    setIsProcessing(true);
    setError(null);

    try {
      await api.post(`/match-requests/${rejectingRequest.id}/reject`, {
        reason: rejectReason || 'Declined by recipient transplant center',
      });
      setRejectingRequest(null);
      setRejectReason('');
      await fetchRequests();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
            Match Requests & Allocation Pipeline
          </h1>
          <p className="text-xs text-slate-400 font-sans">
            Formal cross-hospital match proposals awaiting clinical confirmation, multi-center coordination, and allocation.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRequests}
          className="px-3.5 py-1.5 text-xs font-mono font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xs transition-colors shrink-0"
        >
          Refresh Queue
        </button>
      </div>

      {/* 409 Conflict Alert Banner */}
      {conflictAlert && (
        <div className="bg-red-950/80 border-2 border-red-700 p-4 rounded-xs text-red-100 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="font-mono text-xs font-bold uppercase text-red-300">
              [HTTP 409 {conflictAlert.code}] Allocation Conflict Detected
            </div>
            <p className="text-xs text-red-200 font-sans leading-relaxed">
              {conflictAlert.message}
            </p>
            <div className="text-[11px] font-mono text-red-300">
              The matching queue and donor availability records have been automatically refreshed.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConflictAlert(null)}
            className="text-xs font-mono text-red-300 hover:text-white uppercase shrink-0"
          >
            [Dismiss]
          </button>
        </div>
      )}

      <ErrorMessage error={error} onRetry={fetchRequests} />

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-xs flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 uppercase text-[11px]">Filter by Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-2.5 py-1 text-xs text-white outline-none"
          >
            <option value="">All Proposals ({total})</option>
            <option value="PENDING">Pending Approval</option>
            <option value="CONFIRMED">Confirmed & Allocated</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div className="text-slate-400 text-[11px]">
          Showing {requests.length} of {total} request(s)
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState message="Querying match request queue..." rows={4} />
      ) : requests.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xs">
          <p className="text-xs font-mono text-slate-400 uppercase">No match proposals found in queue</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-950 font-mono text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Request ID</th>
                  <th className="py-2.5 px-3">Target Recipient</th>
                  <th className="py-2.5 px-3">Candidate Donor</th>
                  <th className="py-2.5 px-3">Requesting Hospital</th>
                  <th className="py-2.5 px-3">Compatibility Score</th>
                  <th className="py-2.5 px-3">Request Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions & Graph</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {requests.map((req) => {
                  const isHighlighted = req.id === highlightId;
                  return (
                    <tr
                      key={req.id}
                      className={`transition-colors ${
                        isHighlighted ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : 'hover:bg-slate-850/50'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-bold text-cyan-400">{req.id}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="text-slate-200 font-semibold">{req.recipient_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {req.recipient_id} · ABO: {req.donor_blood_type}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="text-slate-200 font-semibold">{req.donor_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {req.donor_id} · {req.donor_organ}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-sans">
                        <div>{req.requesting_hospital_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {req.requesting_hospital_id}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-emerald-400 font-bold tabular-nums text-sm">
                          {req.match_score} pts
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {new Date(req.request_date).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                        {/* View Graph Button */}
                        <Link
                          to={`/graph/${req.id}`}
                          className="inline-block px-2 py-1 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 rounded-xs transition-colors"
                        >
                          Graph
                        </Link>

                        <button
                          type="button"
                          onClick={() => setSelectedDetails(req)}
                          className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xs"
                        >
                          Details
                        </button>

                        {/* Confirm & Reject (Only for Pending requests) */}
                        {req.status === 'PENDING' && (
                          <RoleGuard allowed={['ADMIN', 'COORDINATOR']}>
                            <button
                              type="button"
                              onClick={() => setConfirmingRequest(req)}
                              className="px-2.5 py-1 text-[11px] font-mono font-bold bg-emerald-900 hover:bg-emerald-800 text-emerald-200 border border-emerald-700 rounded-xs transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingRequest(req)}
                              className="px-2 py-1 text-[11px] font-mono text-red-300 hover:text-red-200 bg-red-950/80 hover:bg-red-900 border border-red-800 rounded-xs transition-colors"
                            >
                              Reject
                            </button>
                          </RoleGuard>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog (Pre-confirmation check as specified) */}
      <ConfirmDialog
        isOpen={!!confirmingRequest}
        title="Confirm Formal Organ Allocation"
        message={`Confirming match request ${confirmingRequest?.id} will commit allocation of donor ${confirmingRequest?.donor_name} (${confirmingRequest?.donor_id}) to recipient ${confirmingRequest?.recipient_name} (${confirmingRequest?.recipient_id}). The donor status will be marked as ALLOCATED and locked against other hospital claims.`}
        confirmLabel="Confirm & Allocate Organ"
        isDestructive={false}
        isLoading={isProcessing}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmingRequest(null)}
      />

      {/* Rejection Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xs p-6 space-y-4">
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              Reject Match Proposal · {rejectingRequest.id}
            </h3>
            <p className="text-xs text-slate-300 font-sans">
              Provide clinical justification for rejecting this match offer.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Recipient acute infection, positive crossmatch, logistical transport window expired..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs p-2 text-xs text-white outline-none font-sans"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingRequest(null)}
                className="px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-white bg-slate-800 rounded-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRejectAction}
                className="px-3.5 py-1.5 text-xs font-mono font-bold bg-red-900 hover:bg-red-800 text-white rounded-xs"
              >
                {isProcessing ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Details Modal */}
      {selectedDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-mono font-bold text-white uppercase">
                  Match Request Dossier · {selectedDetails.id}
                </h3>
                <p className="text-xs text-slate-400">Status: {selectedDetails.status}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetails(null)}
                className="text-slate-400 hover:text-white font-mono text-xs"
              >
                [ESC]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Recipient</span>
                <span className="text-white font-semibold">{selectedDetails.recipient_name}</span>
                <span className="text-[10px] text-slate-400 block">{selectedDetails.recipient_id}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Donor Graft</span>
                <span className="text-white font-semibold">{selectedDetails.donor_name}</span>
                <span className="text-[10px] text-cyan-400 block">{selectedDetails.donor_organ} ({selectedDetails.donor_blood_type})</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Match Score</span>
                <span className="text-emerald-400 font-bold text-sm">{selectedDetails.match_score} pts</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Request Date</span>
                <span className="text-slate-200">{new Date(selectedDetails.request_date).toLocaleString()}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs text-xs font-mono">
              <span className="text-[10px] text-slate-400 uppercase block mb-1">Clinical Notes & Audit Trail</span>
              <p className="text-slate-300 font-sans leading-relaxed">{selectedDetails.notes || 'No notes filed.'}</p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link
                to={`/graph/${selectedDetails.id}`}
                className="px-3.5 py-1.5 text-xs font-mono font-bold bg-cyan-700 hover:bg-cyan-600 text-white rounded-xs"
              >
                Inspect Relational Graph
              </Link>
              <button
                type="button"
                onClick={() => setSelectedDetails(null)}
                className="px-4 py-1.5 text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
