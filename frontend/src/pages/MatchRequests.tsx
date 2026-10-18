import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, ApiError, isMockApiEnabled } from '../api/client';
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
    if (!confirmingRequest || isProcessing) return; // single-flight guard
    setIsProcessing(true);
    setError(null);
    setConflictAlert(null);

    try {
      // Translated in the adapter to POST /matches/requests/{id}/allocate
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
        // 400/401/403/(*)404/422 surface verbatim with backend code + message.
        setError(err);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectAction = async () => {
    if (!rejectingRequest || isProcessing) return; // single-flight guard
    setIsProcessing(true);
    setError(null);

    try {
      // Translated in the adapter to PATCH /matches/requests/{id}/reject
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-navy">
            Match Requests & Allocation Pipeline
          </h1>
          <p className="text-xs text-slate-500 font-sans">
            Formal cross-hospital match proposals awaiting clinical confirmation, multi-center coordination, and allocation.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRequests}
          className="px-3.5 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-md transition-colors shrink-0"
        >
          Refresh Queue
        </button>
      </div>

      {/* 409 Conflict Alert Banner */}
      {conflictAlert && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-red-700 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-red-700">
              [HTTP 409 {conflictAlert.code}] Allocation Conflict Detected
            </div>
            <p className="text-xs text-red-700 font-sans leading-relaxed">
              {conflictAlert.message}
            </p>
            <div className="text-[11px] text-red-700">
              The matching queue and donor availability records have been automatically refreshed.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConflictAlert(null)}
            className="text-xs text-red-700 hover:text-red-800 shrink-0"
          >
            [Dismiss]
          </button>
        </div>
      )}

      <ErrorMessage error={error} onRetry={fetchRequests} />

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs ">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-[11px] font-medium">Filter by Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-300 focus:border-brand rounded-md px-2.5 py-1 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15"
          >
            <option value="">All Proposals ({total})</option>
            <option value="PENDING">Pending Approval</option>
            <option value="CONFIRMED">Confirmed & Allocated</option>
            <option value="REJECTED">Rejected</option>
            {isMockApiEnabled() && <option value="CONFLICT">Conflict</option>}
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="text-slate-500 text-[11px]">
          Showing {requests.length} of {total} request(s)
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState message="Querying match request queue..." rows={4} />
      ) : requests.length === 0 ? (
        <div className="py-12 text-center bg-white border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500">No match proposals found in queue</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-50 text-[11px] font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100 ">
                {requests.map((req) => {
                  const isHighlighted = req.id === highlightId;
                  return (
                    <tr
                      key={req.id}
                      className={`transition-colors ${
                        isHighlighted ? 'bg-accent/40 border-l-2 border-brand' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-medium text-brand-ink">{req.id}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="text-slate-800 font-semibold">{req.recipient_name || req.recipient_id}</div>
                        <div className="text-[11px] text-slate-500 ">
                          ID: {req.recipient_id}
                          {req.donor_blood_type ? ` · ABO: ${req.donor_blood_type}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="text-slate-800 font-semibold">{req.donor_name || req.donor_id}</div>
                        <div className="text-[11px] text-slate-500 ">
                          ID: {req.donor_id}
                          {req.donor_organ ? ` · ${req.donor_organ}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-sans">
                        <div>{req.requesting_hospital_name}</div>
                        <div className="text-[11px] text-slate-500 ">ID: {req.requesting_hospital_id}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-emerald-700 font-bold tabular-nums text-sm">
                          {req.match_score} pts
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {new Date(req.request_date).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                        {/* View Graph Button */}
                        <Link
                          to={`/graph/${req.id}`}
                          className="inline-block px-2 py-1 text-[11px] text-brand-ink hover:text-navy bg-accent hover:bg-accent-strong border border-accent-border rounded-md transition-colors"
                        >
                          Graph
                        </Link>

                        <button
                          type="button"
                          onClick={() => setSelectedDetails(req)}
                          className="px-2 py-1 text-[11px] text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
                        >
                          Details
                        </button>

                        {/* Confirm & Reject (Only for Pending requests) */}
                        {req.status === 'PENDING' && (
                          <RoleGuard allowed={['ADMIN', 'COORDINATOR']}>
                            <button
                              type="button"
                              onClick={() => setConfirmingRequest(req)}
                              className="px-2.5 py-1 text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-200 rounded-md transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingRequest(req)}
                              className="px-2 py-1 text-[11px] text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
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
        message={`Confirming match request ${confirmingRequest?.id} will commit allocation of donor ${confirmingRequest?.donor_name || confirmingRequest?.donor_id} (${confirmingRequest?.donor_id}) to recipient ${confirmingRequest?.recipient_name || confirmingRequest?.recipient_id} (${confirmingRequest?.recipient_id}). The backend will create a permanent allocation record and lock the donor against other hospital claims.`}
        confirmLabel="Confirm & Allocate Organ"
        isDestructive={false}
        isLoading={isProcessing}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmingRequest(null)}
      />

      {/* Rejection Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold text-navy">
              Reject Match Proposal · {rejectingRequest.id}
            </h3>
            <p className="text-xs text-slate-600 font-sans">
              Provide clinical justification for rejecting this match offer.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Recipient acute infection, positive crossmatch, logistical transport window expired..."
              className="w-full bg-white border border-slate-300 focus:border-brand rounded-md p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingRequest(null)}
                className="px-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRejectAction}
                className="px-3.5 py-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-md"
              >
                {isProcessing ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Details Modal */}
      {selectedDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-navy">
                  Match Request Dossier · {selectedDetails.id}
                </h3>
                <p className="text-xs text-slate-500">Status: {selectedDetails.status}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetails(null)}
                className="text-slate-400 hover:text-slate-700 text-xs"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs ">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Recipient</span>
                <span className="text-slate-900 font-semibold">{selectedDetails.recipient_name || selectedDetails.recipient_id}</span>
                <span className="text-[11px] text-slate-500 block">{selectedDetails.recipient_id}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Donor Graft</span>
                <span className="text-slate-900 font-semibold">{selectedDetails.donor_name || selectedDetails.donor_id}</span>
                {(selectedDetails.donor_organ || selectedDetails.donor_blood_type) && (
                  <span className="text-[11px] text-brand-ink block">
                    {selectedDetails.donor_organ}{selectedDetails.donor_blood_type ? ` (${selectedDetails.donor_blood_type})` : ''}
                  </span>
                )}
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Match Score</span>
                <span className="text-emerald-700 font-bold text-sm">{selectedDetails.match_score} pts</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Request Date</span>
                <span className="text-slate-800">{new Date(selectedDetails.request_date).toLocaleString()}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs ">
              <span className="text-[11px] font-medium text-slate-500 block mb-1">Clinical Notes & Audit Trail</span>
              <p className="text-slate-600 font-sans leading-relaxed">{selectedDetails.notes || 'No notes filed.'}</p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link
                to={`/graph/${selectedDetails.id}`}
                className="px-3.5 py-1.5 text-xs font-medium bg-navy hover:bg-navy-dark text-white rounded-md"
              >
                Inspect Relational Graph
              </Link>
              <button
                type="button"
                onClick={() => setSelectedDetails(null)}
                className="px-4 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md"
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
