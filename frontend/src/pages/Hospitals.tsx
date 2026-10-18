import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../api/client';
import { Hospital, PaginatedResponse } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
import { AddHospitalModal } from '../components/AddHospitalModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RoleGuard } from '../auth/RoleGuard';

export const Hospitals: React.FC = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingHospital, setEditingHospital] = useState<Hospital | null>(null);
  const [hospitalToDelete, setHospitalToDelete] = useState<Hospital | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);

  const fetchHospitals = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedResponse<Hospital>>('/hospitals');
      setHospitals(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, []);

  const handleDelete = async () => {
    if (!hospitalToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/hospitals/${hospitalToDelete.id}`);
      setHospitalToDelete(null);
      fetchHospitals();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-navy">
            Hospital Infrastructure Network
          </h1>
          <p className="text-xs text-slate-500 font-sans">
            Accredited transplant centers, regional organ procurement organizations (OPOs), and trauma hubs.
          </p>
        </div>
        <RoleGuard allowed={['ADMIN']}>
          <button
            type="button"
            onClick={() => {
              setEditingHospital(null);
              setIsAddModalOpen(true);
            }}
            className="px-3.5 py-1.5 text-xs font-medium bg-navy hover:bg-navy-dark text-white border border-transparent rounded-md transition-colors shrink-0"
          >
            + Register Hospital Center
          </button>
        </RoleGuard>
      </div>

      <ErrorMessage error={error} onRetry={fetchHospitals} />

      {isLoading ? (
        <LoadingState message="Fetching accredited hospital centers..." rows={5} />
      ) : hospitals.length === 0 ? (
        <div className="py-12 text-center bg-white border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500">No hospital nodes found</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-50 text-[11px] font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Node ID</th>
                  <th className="py-2.5 px-3">Institution Name</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Accreditation Tier</th>
                  <th className="py-2.5 px-3">Contact Number</th>
                  <th className="py-2.5 px-3">Transplant Coordinator</th>
                  <th className="py-2.5 px-3">Active Transplants</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 ">
                {hospitals.map((hospital) => (
                  <tr key={hospital.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-brand-ink">{hospital.id}</td>
                    <td className="py-2.5 px-3 text-slate-800 font-sans font-medium">
                      {hospital.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                      <div>{hospital.location}</div>
                      {hospital.location_coordinates && (
                        <div className="text-[11px] text-slate-500 ">
                          {hospital.location_coordinates.latitude.toFixed(2)}, {hospital.location_coordinates.longitude.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {hospital.tier || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {hospital.contact_number || <span className="text-slate-600 ">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                      {hospital.coordinator_name || <span className="text-slate-600 ">—</span>}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-700 tabular-nums">
                      {hospital.active_transplants != null ? `${hospital.active_transplants} cases` : <span className="text-slate-600 ">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedHospital(hospital)}
                        className="px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        View
                      </button>

                      <RoleGuard allowed={['ADMIN']}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingHospital(hospital);
                            setIsAddModalOpen(true);
                          }}
                          className="px-2 py-0.5 text-[11px] text-brand-ink hover:text-navy bg-accent hover:bg-accent-strong border border-accent-border rounded-md"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setHospitalToDelete(hospital)}
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

          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div>
              Total Hospital Hubs: <span className="text-slate-900 font-semibold">{total}</span>
            </div>
            <div className="text-[11px]">Accreditation: UNOS & National Organ Transplant Act Compliant</div>
          </div>
        </div>
      )}

      {/* Add / Edit Hospital Modal */}
      <AddHospitalModal
        isOpen={isAddModalOpen}
        initialData={editingHospital}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingHospital(null);
        }}
        onSuccess={() => fetchHospitals()}
      />

      {/* Hospital View Modal */}
      {selectedHospital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-navy">
                  Hospital Node · {selectedHospital.id}
                </h3>
                <p className="text-xs text-slate-500">{selectedHospital.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHospital(null)}
                className="text-slate-400 hover:text-slate-700 text-xs"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 text-xs ">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Location</span>
                <span className="text-slate-900 font-semibold">{selectedHospital.location}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Accreditation Tier</span>
                <span className="text-brand-ink font-semibold">{selectedHospital.tier}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Emergency Dispatch</span>
                <span className="text-slate-900">{selectedHospital.contact_number}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                <span className="text-[11px] font-medium text-slate-500 block">Chief Coordinator</span>
                <span className="text-slate-900">{selectedHospital.coordinator_name}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedHospital(null)}
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
        isOpen={!!hospitalToDelete}
        title="Confirm Hospital Deregistration"
        message={`Are you certain you wish to deregister ${hospitalToDelete?.name} (${hospitalToDelete?.id}) from the national network?`}
        confirmLabel="Deregister Hospital"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setHospitalToDelete(null)}
      />
    </div>
  );
};
