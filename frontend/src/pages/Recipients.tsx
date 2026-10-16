import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Recipient, PaginatedResponse } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';
import { AddRecipientModal } from '../components/AddRecipientModal';
import { UpdateUrgencyModal } from '../components/UpdateUrgencyModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RoleGuard } from '../auth/RoleGuard';
import { useAuth } from '../auth/AuthContext';

export const Recipients: React.FC = () => {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [bloodTypeFilter, setBloodTypeFilter] = useState<string>('');
  const [organFilter, setOrganFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);

  // Modals & Actions
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  const [urgencyRecipient, setUrgencyRecipient] = useState<Recipient | null>(null);
  const [recipientToDelete, setRecipientToDelete] = useState<Recipient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);

  const { role } = useAuth();
  const navigate = useNavigate();

  const fetchRecipients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        page_size: 20,
      };
      if (search) params.search = search;
      if (bloodTypeFilter) params.blood_type = bloodTypeFilter;
      if (organFilter) params.organ_needed = organFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await api.get<PaginatedResponse<Recipient>>('/recipients', params);
      setRecipients(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipients();
  }, [page, bloodTypeFilter, organFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchRecipients();
  };

  const handleDelete = async () => {
    if (!recipientToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/recipients/${recipientToDelete.id}`);
      setRecipientToDelete(null);
      fetchRecipients();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
            Recipient Waitlist Management
          </h1>
          <p className="text-xs text-slate-400 font-sans">
            Candidate prioritization matrix based on clinical urgency, organ failure severity, and waitlist time.
          </p>
        </div>
        <RoleGuard allowed={['ADMIN', 'COORDINATOR']}>
          <button
            type="button"
            onClick={() => {
              setEditingRecipient(null);
              setIsAddModalOpen(true);
            }}
            className="px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 rounded-xs transition-colors shrink-0"
          >
            + Enroll Recipient
          </button>
        </RoleGuard>
      </div>

      <ErrorMessage error={error} onRetry={fetchRecipients} />

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="col-span-1 sm:col-span-2 lg:col-span-1">
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
              Search Patient / ID
            </label>
            <div className="flex">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, ID, or Hospital..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-l-xs px-3 py-1.5 text-xs text-white outline-none font-mono"
              />
              <button
                type="submit"
                className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-l-0 border-slate-700 rounded-r-xs text-xs font-mono"
              >
                Go
              </button>
            </div>
          </form>

          {/* Blood Type Filter */}
          <div>
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
              ABO Blood Group
            </label>
            <select
              value={bloodTypeFilter}
              onChange={(e) => {
                setBloodTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-2.5 py-1.5 text-xs text-white outline-none font-mono"
            >
              <option value="">All Blood Types</option>
              <option value="O-">O-</option>
              <option value="O+">O+</option>
              <option value="A-">A-</option>
              <option value="A+">A+</option>
              <option value="B-">B-</option>
              <option value="B+">B+</option>
              <option value="AB-">AB-</option>
              <option value="AB+">AB+</option>
            </select>
          </div>

          {/* Organ Needed Filter */}
          <div>
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
              Organ Needed
            </label>
            <select
              value={organFilter}
              onChange={(e) => {
                setOrganFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-2.5 py-1.5 text-xs text-white outline-none font-mono"
            >
              <option value="">All Organs Needed</option>
              <option value="Kidney">Kidney</option>
              <option value="Liver">Liver</option>
              <option value="Heart">Heart</option>
              <option value="Lung">Lung</option>
              <option value="Pancreas">Pancreas</option>
              <option value="Cornea">Cornea</option>
              <option value="Whole Blood">Whole Blood</option>
              <option value="Platelets">Platelets</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-2.5 py-1.5 text-xs text-white outline-none font-mono"
            >
              <option value="">All Statuses</option>
              <option value="WAITING">Waiting</option>
              <option value="MATCHED">Matched</option>
              <option value="TRANSPLANTED">Transplanted</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        {(search || bloodTypeFilter || organFilter || statusFilter) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
            <span className="text-slate-400 font-mono text-[11px]">
              Filtered results: {total} matching patient record(s)
            </span>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setBloodTypeFilter('');
                setOrganFilter('');
                setStatusFilter('');
                setPage(1);
              }}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState message="Fetching active waitlist registries..." rows={5} />
      ) : recipients.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xs">
          <p className="text-xs font-mono text-slate-400 uppercase">No recipient records found</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xs overflow-hidden">
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
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Waitlist Since</th>
                  <th className="py-2.5 px-3 text-right">Matching & Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {recipients.map((recipient) => (
                  <tr key={recipient.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-cyan-400">{recipient.id}</td>
                    <td className="py-2.5 px-3 text-slate-200 font-sans font-medium">
                      {recipient.name}
                      <span className="block text-[10px] text-slate-400 font-mono">
                        Age: {recipient.age} · {recipient.gender}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">{recipient.blood_type}</td>
                    <td className="py-2.5 px-3 text-cyan-300 font-semibold">{recipient.organ_needed}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold tabular-nums text-sm ${
                          recipient.urgency_score >= 90 ? 'text-red-400' : recipient.urgency_score >= 75 ? 'text-amber-400' : 'text-slate-300'
                        }`}>
                          {recipient.urgency_score}
                        </span>
                        <RoleGuard allowed={['DOCTOR', 'ADMIN']}>
                          <button
                            type="button"
                            onClick={() => setUrgencyRecipient(recipient)}
                            className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-xs"
                            title="Adjust clinical score"
                          >
                            Edit
                          </button>
                        </RoleGuard>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      <div>{recipient.hospital_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{recipient.location}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={recipient.status} />
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {new Date(recipient.waiting_list_date).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5">
                      {/* Navigate to Matching Page */}
                      <Link
                        to={`/matching/${recipient.id}`}
                        className="inline-block px-2.5 py-1 text-[11px] font-mono font-bold bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 rounded-xs transition-colors"
                      >
                        Match Donors
                      </Link>

                      <button
                        type="button"
                        onClick={() => setSelectedRecipient(recipient)}
                        className="px-2 py-0.5 text-[11px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xs"
                      >
                        View
                      </button>

                      <RoleGuard allowed={['ADMIN', 'COORDINATOR']}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRecipient(recipient);
                            setIsAddModalOpen(true);
                          }}
                          className="px-2 py-0.5 text-[11px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xs"
                        >
                          Edit
                        </button>
                      </RoleGuard>

                      <RoleGuard allowed={['ADMIN']}>
                        <button
                          type="button"
                          onClick={() => setRecipientToDelete(recipient)}
                          className="px-2 py-0.5 text-[11px] font-mono text-red-300 hover:text-red-200 bg-red-950/80 hover:bg-red-900 border border-red-800 rounded-xs"
                        >
                          Delete
                        </button>
                      </RoleGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
            <div>
              Total Waiting: <span className="text-white font-bold">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 bg-slate-900 disabled:opacity-30 border border-slate-700 rounded-xs text-white"
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                disabled={recipients.length < 20}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 bg-slate-900 disabled:opacity-30 border border-slate-700 rounded-xs text-white"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <AddRecipientModal
        isOpen={isAddModalOpen}
        initialData={editingRecipient}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingRecipient(null);
        }}
        onSuccess={() => fetchRecipients()}
      />

      {/* Update Urgency Modal */}
      <UpdateUrgencyModal
        isOpen={!!urgencyRecipient}
        recipient={urgencyRecipient}
        onClose={() => setUrgencyRecipient(null)}
        onSuccess={() => {
          setUrgencyRecipient(null);
          fetchRecipients();
        }}
      />

      {/* Recipient Details Dossier Modal */}
      {selectedRecipient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-mono font-bold text-white uppercase">
                  Patient File · {selectedRecipient.id}
                </h3>
                <p className="text-xs text-slate-400">{selectedRecipient.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecipient(null)}
                className="text-slate-400 hover:text-white font-mono text-xs"
              >
                [ESC]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Organ Needed</span>
                <span className="text-cyan-400 font-bold text-sm">{selectedRecipient.organ_needed}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">ABO Blood Group</span>
                <span className="text-white font-bold text-sm">{selectedRecipient.blood_type}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Clinical Urgency</span>
                <span className="text-red-400 font-bold text-sm">{selectedRecipient.urgency_score} / 100</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Current Status</span>
                <StatusBadge status={selectedRecipient.status} />
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Hospital Node</span>
                <span className="text-slate-200 truncate block">{selectedRecipient.hospital_name}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Waitlist Date</span>
                <span className="text-slate-200">{new Date(selectedRecipient.waiting_list_date).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs text-xs font-mono">
              <span className="text-[10px] text-slate-400 uppercase block mb-1">Contact Protocol</span>
              <div className="text-slate-300">Email: {selectedRecipient.contact_email || 'Not registered'}</div>
              <div className="text-slate-300">Center: {selectedRecipient.location}</div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  const id = selectedRecipient.id;
                  setSelectedRecipient(null);
                  navigate(`/matching/${id}`);
                }}
                className="px-3.5 py-1.5 text-xs font-mono font-bold bg-cyan-700 hover:bg-cyan-600 text-white rounded-xs"
              >
                Launch Compatibility Matcher
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecipient(null)}
                className="px-4 py-1.5 text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!recipientToDelete}
        title="Confirm Recipient Removal"
        message={`Are you certain you wish to remove patient ${recipientToDelete?.name} (${recipientToDelete?.id}) from the active waiting list?`}
        confirmLabel="Remove Patient"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setRecipientToDelete(null)}
      />
    </div>
  );
};
