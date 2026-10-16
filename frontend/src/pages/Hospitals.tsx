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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
            Hospital Infrastructure Network
          </h1>
          <p className="text-xs text-slate-400 font-sans">
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
            className="px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 rounded-xs transition-colors shrink-0"
          >
            + Register Hospital Center
          </button>
        </RoleGuard>
      </div>

      <ErrorMessage error={error} onRetry={fetchHospitals} />

      {isLoading ? (
        <LoadingState message="Fetching accredited hospital centers..." rows={5} />
      ) : hospitals.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xs">
          <p className="text-xs font-mono text-slate-400 uppercase">No hospital nodes found</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-950 font-mono text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
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
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {hospitals.map((hospital) => (
                  <tr key={hospital.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-cyan-400">{hospital.id}</td>
                    <td className="py-2.5 px-3 text-slate-200 font-sans font-medium">
                      {hospital.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">{hospital.location}</td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{hospital.tier}</td>
                    <td className="py-2.5 px-3 text-slate-300">{hospital.contact_number}</td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">{hospital.coordinator_name}</td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400 tabular-nums">
                      {hospital.active_transplants} cases
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedHospital(hospital)}
                        className="px-2 py-0.5 text-[11px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xs"
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
                          className="px-2 py-0.5 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 rounded-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setHospitalToDelete(hospital)}
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

          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
            <div>
              Total Hospital Hubs: <span className="text-white font-bold">{total}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-mono font-bold text-white uppercase">
                  Hospital Node · {selectedHospital.id}
                </h3>
                <p className="text-xs text-slate-400">{selectedHospital.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHospital(null)}
                className="text-slate-400 hover:text-white font-mono text-xs"
              >
                [ESC]
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Location</span>
                <span className="text-white font-semibold">{selectedHospital.location}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Accreditation Tier</span>
                <span className="text-cyan-400 font-semibold">{selectedHospital.tier}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Emergency Dispatch</span>
                <span className="text-white">{selectedHospital.contact_number}</span>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xs">
                <span className="text-[10px] text-slate-400 uppercase block">Chief Coordinator</span>
                <span className="text-white">{selectedHospital.coordinator_name}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedHospital(null)}
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
