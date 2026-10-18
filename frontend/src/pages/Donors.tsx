import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../api/client';
import { Donor, BloodType, OrganType, PaginatedResponse } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';
import { ExpiryCountdown } from '../components/ExpiryCountdown';
import { AddDonorModal } from '../components/AddDonorModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RoleGuard } from '../auth/RoleGuard';

export const Donors: React.FC = () => {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [bloodTypeFilter, setBloodTypeFilter] = useState<string>('');
  const [organTypeFilter, setOrganTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null);
  const [donorToDelete, setDonorToDelete] = useState<Donor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedDonorDetails, setSelectedDonorDetails] = useState<Donor | null>(null);

  const fetchDonors = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        page_size: 20,
      };
      if (search) params.search = search;
      if (bloodTypeFilter) params.blood_type = bloodTypeFilter;
      if (organTypeFilter) params.organ_type = organTypeFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await api.get<PaginatedResponse<Donor>>('/donors', params);
      setDonors(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDonors();
  }, [page, bloodTypeFilter, organTypeFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchDonors();
  };

  const handleDelete = async () => {
    if (!donorToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/donors/${donorToDelete.id}`);
      setDonorToDelete(null);
      fetchDonors();
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
            Donor Procurement Registry
          </h1>
          <p className="text-xs text-slate-500 font-sans">
            Catalogue of deceased and living donors, real-time viability timers, and organ availability status.
            {donors.some((d) => d.expiry_window_hours != null) &&
              ' Viability timers are a display calculation: registration time + reported viability window.'}
          </p>
        </div>
        <RoleGuard allowed={['ADMIN', 'COORDINATOR']}>
          <button
            type="button"
            onClick={() => {
              setEditingDonor(null);
              setIsAddModalOpen(true);
            }}
            className="px-3.5 py-1.5 text-xs font-medium bg-navy hover:bg-navy-dark text-white border border-transparent rounded-md transition-colors shrink-0"
          >
            + Register Donor
          </button>
        </RoleGuard>
      </div>

      <ErrorMessage error={error} onRetry={fetchDonors} />

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-md space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="col-span-1 sm:col-span-2 lg:col-span-1">
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Search Donor or ID
            </label>
            <div className="flex">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ID, Name, or City..."
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
              <option value="O-">O- (Universal)</option>
              <option value="O+">O+</option>
              <option value="A-">A-</option>
              <option value="A+">A+</option>
              <option value="B-">B-</option>
              <option value="B+">B+</option>
              <option value="AB-">AB-</option>
              <option value="AB+">AB+</option>
            </select>
          </div>

          {/* Organ Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Organ / Tissue
            </label>
            <select
              value={organTypeFilter}
              onChange={(e) => {
                setOrganTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
            >
              <option value="">All Organs & Tissues</option>
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
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="MATCHED">Matched</option>
              <option value="ALLOCATED">Allocated</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
        </div>

        {(search || bloodTypeFilter || organTypeFilter || statusFilter) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
            <span className="text-slate-500 text-[11px]">
              Filtered results: {total} matching donor record(s)
            </span>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setBloodTypeFilter('');
                setOrganTypeFilter('');
                setStatusFilter('');
                setPage(1);
              }}
              className="text-xs text-brand-ink hover:text-navy"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Data Table */}
      {isLoading ? (
        <LoadingState message="Fetching donor procurement records..." rows={5} />
      ) : donors.length === 0 ? (
        <div className="py-12 text-center bg-white border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500">No donor records found matching criteria</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-50 text-[11px] font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Donor ID</th>
                  <th className="py-2.5 px-3">Donor Name</th>
                  <th className="py-2.5 px-3">ABO</th>
                  <th className="py-2.5 px-3">Organ</th>
                  <th className="py-2.5 px-3">Location / Center</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Viability Countdown</th>
                  <th className="py-2.5 px-3">Registered</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 ">
                {donors.map((donor) => (
                  <tr key={donor.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-brand-ink">{donor.id}</td>
                    <td className="py-2.5 px-3 text-slate-800 font-sans font-medium">
                      {donor.name}
                      {Number.isFinite(donor.age) && (
                        <span className="block text-[11px] text-slate-500 ">
                          Age: {donor.age} · {donor.gender}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{donor.blood_type}</td>
                    <td className="py-2.5 px-3 text-slate-600">{donor.organ_type}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                      <div>{donor.location}</div>
                      <div className="text-[11px] text-slate-500 ">
                        {donor.expiry_window_hours
                          ? `Viability window: ${donor.expiry_window_hours}h`
                          : donor.hospital_name || ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={donor.status} />
                    </td>
                    <td className="py-2.5 px-3">
                      <ExpiryCountdown expiresAt={donor.expires_at} isExpired={donor.status === 'EXPIRED'} />
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {new Date(donor.registration_date).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setSelectedDonorDetails(donor)}
                        className="px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        View
                      </button>

                      <RoleGuard allowed={['ADMIN', 'COORDINATOR']}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDonor(donor);
                            setIsAddModalOpen(true);
                          }}
                          className="px-2 py-0.5 text-[11px] text-brand-ink hover:text-navy bg-accent hover:bg-accent-strong border border-accent-border rounded-md"
                        >
                          Edit
                        </button>
                      </RoleGuard>

                      <RoleGuard allowed={['ADMIN']}>
                        <button
                          type="button"
                          onClick={() => setDonorToDelete(donor)}
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
              Total Donors: <span className="text-slate-900 font-semibold">{total}</span>
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
                disabled={donors.length < 20}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 bg-white hover:bg-slate-50 disabled:opacity-30 border border-slate-300 rounded-md text-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Donor Modal */}
      <AddDonorModal
        isOpen={isAddModalOpen}
        initialData={editingDonor}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingDonor(null);
        }}
        onSuccess={() => fetchDonors()}
      />

      {/* View Donor Details Drawer Modal */}
      {selectedDonorDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-navy">
                  Donor Dossier · {selectedDonorDetails.id}
                </h3>
                <p className="text-xs text-slate-500">{selectedDonorDetails.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDonorDetails(null)}
                className="text-slate-400 hover:text-slate-700 text-xs"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs ">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Blood Group</span>
                <span className="text-slate-900 font-semibold text-sm">{selectedDonorDetails.blood_type}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Organ Type</span>
                <span className="text-brand-ink font-semibold text-sm">{selectedDonorDetails.organ_type}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Location</span>
                <span className="text-slate-800">{selectedDonorDetails.location}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Hospital Affiliation</span>
                <span className="text-slate-800 truncate block">
                  {selectedDonorDetails.hospital_name || 'Not recorded by backend'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">HLA Tissue Typing</span>
                <span className="text-slate-800">{selectedDonorDetails.hla_type || 'Not recorded by backend'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Current Status</span>
                <StatusBadge status={selectedDonorDetails.status} />
              </div>
            </div>

            {selectedDonorDetails.medical_notes && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">
                  Medical & Preservation Documentation
                </span>
                <p className="text-xs text-slate-600 font-sans leading-relaxed">
                  {selectedDonorDetails.medical_notes}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedDonorDetails(null)}
                className="px-4 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Donor Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!donorToDelete}
        title="Confirm Donor Record Deletion"
        message={`Are you certain you wish to delete donor record ${donorToDelete?.id} (${donorToDelete?.name})? This action cannot be reversed.`}
        confirmLabel="Delete Record"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDonorToDelete(null)}
      />
    </div>
  );
};
