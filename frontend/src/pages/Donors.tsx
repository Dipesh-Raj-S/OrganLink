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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
            Donor Procurement Registry
          </h1>
          <p className="text-xs text-slate-400 font-sans">
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
            className="px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 rounded-xs transition-colors shrink-0"
          >
            + Register Donor
          </button>
        </RoleGuard>
      </div>

      <ErrorMessage error={error} onRetry={fetchDonors} />

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="col-span-1 sm:col-span-2 lg:col-span-1">
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
              Search Donor or ID
            </label>
            <div className="flex">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ID, Name, or City..."
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
            <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
              Organ / Tissue
            </label>
            <select
              value={organTypeFilter}
              onChange={(e) => {
                setOrganTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-2.5 py-1.5 text-xs text-white outline-none font-mono"
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
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="MATCHED">Matched</option>
              <option value="ALLOCATED">Allocated</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
        </div>

        {(search || bloodTypeFilter || organTypeFilter || statusFilter) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
            <span className="text-slate-400 font-mono text-[11px]">
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
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300"
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
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xs">
          <p className="text-xs font-mono text-slate-400 uppercase">No donor records found matching criteria</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-950 font-mono text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
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
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {donors.map((donor) => (
                  <tr key={donor.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-cyan-400">{donor.id}</td>
                    <td className="py-2.5 px-3 text-slate-200 font-sans font-medium">
                      {donor.name}
                      {Number.isFinite(donor.age) && (
                        <span className="block text-[10px] text-slate-400 font-mono">
                          Age: {donor.age} · {donor.gender}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">{donor.blood_type}</td>
                    <td className="py-2.5 px-3 text-slate-300">{donor.organ_type}</td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      <div>{donor.location}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
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
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {new Date(donor.registration_date).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setSelectedDonorDetails(donor)}
                        className="px-2 py-0.5 text-[11px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xs"
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
                          className="px-2 py-0.5 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 rounded-xs"
                        >
                          Edit
                        </button>
                      </RoleGuard>

                      <RoleGuard allowed={['ADMIN']}>
                        <button
                          type="button"
                          onClick={() => setDonorToDelete(donor)}
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
              Total Donors: <span className="text-white font-bold">{total}</span>
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
                disabled={donors.length < 20}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 bg-slate-900 disabled:opacity-30 border border-slate-700 rounded-xs text-white"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-mono font-bold text-white uppercase">
                  Donor Dossier · {selectedDonorDetails.id}
                </h3>
                <p className="text-xs text-slate-400">{selectedDonorDetails.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDonorDetails(null)}
                className="text-slate-400 hover:text-white font-mono text-xs"
              >
                [ESC]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Blood Group</span>
                <span className="text-white font-bold text-sm">{selectedDonorDetails.blood_type}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Organ Type</span>
                <span className="text-cyan-400 font-bold text-sm">{selectedDonorDetails.organ_type}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Location</span>
                <span className="text-slate-200">{selectedDonorDetails.location}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Hospital Affiliation</span>
                <span className="text-slate-200 truncate block">
                  {selectedDonorDetails.hospital_name || 'Not recorded by backend'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">HLA Tissue Typing</span>
                <span className="text-slate-200">{selectedDonorDetails.hla_type || 'Not recorded by backend'}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Current Status</span>
                <StatusBadge status={selectedDonorDetails.status} />
              </div>
            </div>

            {selectedDonorDetails.medical_notes && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block font-mono mb-1">
                  Medical & Preservation Documentation
                </span>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {selectedDonorDetails.medical_notes}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedDonorDetails(null)}
                className="px-4 py-1.5 text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-xs"
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
