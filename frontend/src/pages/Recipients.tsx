import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, isMockApiEnabled } from '../api/client';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-navy">
            Recipient Waitlist Management
          </h1>
          <p className="text-xs text-slate-500 font-sans">
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
            className="px-3.5 py-1.5 text-xs font-medium bg-navy hover:bg-navy-dark text-white border border-transparent rounded-md transition-colors shrink-0"
          >
            + Enroll Recipient
          </button>
        </RoleGuard>
      </div>

      <ErrorMessage error={error} onRetry={fetchRecipients} />

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-md space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="col-span-1 sm:col-span-2 lg:col-span-1">
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Search Patient / ID
            </label>
            <div className="flex">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, ID, or Hospital..."
                className="w-full bg-white border border-slate-300 focus:border-brand rounded-l-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
              />
              <button
                type="submit"
                className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-l-0 border-slate-300 rounded-r-md text-xs "
              >
                Go
              </button>
            </div>
          </form>

          {/* Blood Type Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              ABO Blood Group
            </label>
            <select
              value={bloodTypeFilter}
              onChange={(e) => {
                setBloodTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
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
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Organ Needed
            </label>
            <select
              value={organFilter}
              onChange={(e) => {
                setOrganFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
            >
              <option value="">All Organs Needed</option>
              <option value="Kidney">Kidney</option>
              <option value="Liver">Liver</option>
              <option value="Heart">Heart</option>
              <option value="Lung">Lung</option>
              <option value="Pancreas">Pancreas</option>
              {isMockApiEnabled() && (
                <>
                  <option value="Cornea">Cornea</option>
                  <option value="Whole Blood">Whole Blood</option>
                  <option value="Platelets">Platelets</option>
                </>
              )}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
            >
              <option value="">All Statuses</option>
              <option value="WAITING">Waiting</option>
              {isMockApiEnabled() ? (
                <>
                  <option value="MATCHED">Matched</option>
                  <option value="TRANSPLANTED">Transplanted</option>
                  <option value="INACTIVE">Inactive</option>
                </>
              ) : (
                <option value="ALLOCATED">Allocated</option>
              )}
            </select>
          </div>
        </div>

          {(search || bloodTypeFilter || organFilter || statusFilter) && (
            <>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                <span className="text-slate-500 text-[11px]">
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
                  className="text-xs text-brand-ink hover:text-navy"
                >
                  Reset Filters
                </button>
              </div>
              {search && !isMockApiEnabled() && (
                <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                  Live search narrows records on the current page only; the backend supports
                  server-side filtering by organ, blood type, hospital, and status.
                </div>
              )}
            </>
          )}
        </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState message="Fetching active waitlist registries..." rows={5} />
      ) : recipients.length === 0 ? (
        <div className="py-12 text-center bg-white border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500">No recipient records found</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-50 text-[11px] font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100 ">
                {recipients.map((recipient) => (
                  <tr key={recipient.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-brand-ink">{recipient.id}</td>
                    <td className="py-2.5 px-3 text-slate-800 font-sans font-medium">
                      {recipient.name}
                      {Number.isFinite(recipient.age) && (
                        <span className="block text-[11px] text-slate-500 ">
                          Age: {recipient.age} · {recipient.gender}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{recipient.blood_type}</td>
                    <td className="py-2.5 px-3 text-navy font-semibold">{recipient.organ_needed}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold tabular-nums text-sm ${
                          recipient.urgency_score >= (recipient.urgency_denominator === 10 ? 9 : 90)
                            ? 'text-red-600'
                            : recipient.urgency_score >= (recipient.urgency_denominator === 10 ? 8 : 75)
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}>
                          {recipient.urgency_score}
                          <span className="text-[11px] text-slate-500 font-normal">
                            {' '}/{ recipient.urgency_denominator === 10 ? 10 : 100 }
                          </span>
                        </span>
                        <RoleGuard allowed={['DOCTOR', 'ADMIN']}>
                          <button
                            type="button"
                            onClick={() => setUrgencyRecipient(recipient)}
                            className="px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-900 bg-slate-100 border border-slate-200 rounded-md"
                            title="Adjust clinical score"
                          >
                            Edit
                          </button>
                        </RoleGuard>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                      <div>{recipient.hospital_name}</div>
                      <div className="text-[11px] text-slate-500 ">{recipient.location}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={recipient.status} />
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {new Date(recipient.waiting_list_date).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5">
                      {/* Navigate to Matching Page */}
                      <Link
                        to={`/matching/${recipient.id}`}
                        className="inline-block px-2.5 py-1 text-[11px] font-medium bg-navy hover:bg-navy-dark text-white border border-transparent rounded-md transition-colors"
                      >
                        Match Donors
                      </Link>

                      <button
                        type="button"
                        onClick={() => setSelectedRecipient(recipient)}
                        className="px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
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
                          className="px-2 py-0.5 text-[11px] text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md"
                        >
                          Edit
                        </button>
                      </RoleGuard>

                      <RoleGuard allowed={['ADMIN']}>
                        <button
                          type="button"
                          onClick={() => setRecipientToDelete(recipient)}
                          className="px-2 py-0.5 text-[11px] text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md"
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
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div>
              Total Waiting: <span className="text-slate-900 font-semibold">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 bg-white hover:bg-slate-50 disabled:opacity-30 border border-slate-300 rounded-md text-slate-700"
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                disabled={recipients.length < 20}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 bg-white hover:bg-slate-50 disabled:opacity-30 border border-slate-300 rounded-md text-slate-700"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-navy">
                  Patient File · {selectedRecipient.id}
                </h3>
                <p className="text-xs text-slate-500">{selectedRecipient.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecipient(null)}
                className="text-slate-400 hover:text-slate-700 text-xs"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs ">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Organ Needed</span>
                <span className="text-brand-ink font-semibold text-sm">{selectedRecipient.organ_needed}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">ABO Blood Group</span>
                <span className="text-slate-900 font-semibold text-sm">{selectedRecipient.blood_type}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Clinical Urgency</span>
                <span className="text-slate-900 font-semibold text-sm">
                  {selectedRecipient.urgency_score} / {selectedRecipient.urgency_denominator === 10 ? 10 : 100}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Current Status</span>
                <StatusBadge status={selectedRecipient.status} />
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Hospital Node</span>
                <span className="text-slate-800 truncate block">{selectedRecipient.hospital_name}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Waitlist Date</span>
                <span className="text-slate-800">{new Date(selectedRecipient.waiting_list_date).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs ">
              <span className="text-[11px] font-medium text-slate-500 block mb-1">Contact Protocol</span>
              <div className="text-slate-600">Email: {selectedRecipient.contact_email || 'Not registered'}</div>
              <div className="text-slate-600">Center: {selectedRecipient.location}</div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  const id = selectedRecipient.id;
                  setSelectedRecipient(null);
                  navigate(`/matching/${id}`);
                }}
                className="px-3.5 py-1.5 text-xs font-medium bg-navy hover:bg-navy-dark text-white rounded-md"
              >
                Launch Compatibility Matcher
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecipient(null)}
                className="px-4 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md"
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
