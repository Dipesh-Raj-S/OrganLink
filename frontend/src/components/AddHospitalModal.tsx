import React, { useState } from 'react';
import { Hospital } from '../types';
import { api, ApiError, isMockApiEnabled } from '../api/client';
import { ErrorMessage } from './ErrorMessage';

interface AddHospitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newHospital: Hospital) => void;
  initialData?: Hospital | null;
}

export const AddHospitalModal: React.FC<AddHospitalModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}) => {
  const isEditing = !!initialData;
  // Live backend HospitalCreate/Update accepts only name + coordinate location
  // (verified); mock keeps the full legacy form.
  const isMock = isMockApiEnabled();
  const [name, setName] = useState(initialData?.name || '');
  const [location, setLocation] = useState(initialData?.location || '');
  const [latitude, setLatitude] = useState(
    initialData?.location_coordinates ? String(initialData.location_coordinates.latitude) : ''
  );
  const [longitude, setLongitude] = useState(
    initialData?.location_coordinates ? String(initialData.location_coordinates.longitude) : ''
  );
  const [tier, setTier] = useState(initialData?.tier || 'Level 1 Trauma & Transplant Center');
  const [contactNumber, setContactNumber] = useState(initialData?.contact_number || '');
  const [coordinatorName, setCoordinatorName] = useState(initialData?.coordinator_name || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | ApiError | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(new Error('Hospital institution name is required'));
      return;
    }
    if (isMock && !location.trim()) {
      setError(new Error('Location is required'));
      return;
    }

    let coordinates: { latitude: number; longitude: number } | undefined;
    if (!isMock) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (
        latitude.trim() === '' ||
        longitude.trim() === '' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        setError(new Error('Valid coordinates are required (latitude -90..90, longitude -180..180)'));
        return;
      }
      coordinates = { latitude: lat, longitude: lng };
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        location: isMock ? location.trim() : '',
      };
      if (isMock) {
        payload.tier = tier.trim();
        payload.contact_number = contactNumber.trim();
        payload.coordinator_name = coordinatorName.trim();
      } else if (coordinates) {
        payload.location_coordinates = coordinates;
      }

      let result: Hospital;
      if (isEditing && initialData) {
        result = await api.patch<Hospital>(`/hospitals/${initialData.id}`, payload);
      } else {
        result = await api.post<Hospital>('/hospitals', payload);
      }

      onSuccess(result);
      onClose();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-lg p-6">
        <div className="border-b border-slate-200 pb-3 mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy">
            {isEditing ? `Edit Hospital Node ${initialData?.id}` : 'Register Hospital Center'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xs"
          >
            Close
          </button>
        </div>

        <ErrorMessage error={error} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Hospital Center Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stanford University Medical Center"
              className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
            />
          </div>

          {isMock ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Location (City, State) *
                </label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Palo Alto, CA"
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="+1 (650) 723-4000"
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Latitude (-90..90) *
                </label>
                <input
                  type="text"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g. 37.4316"
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Longitude (-180..180) *
                </label>
                <input
                  type="text"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g. -122.1350"
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
                />
              </div>
            </div>
          )}

          {isMock && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Accreditation Tier
                </label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
                >
                  <option value="Level 1 Trauma & Transplant Center">Level 1 Trauma & Transplant Center</option>
                  <option value="Comprehensive Organ Transplant Center">Comprehensive Organ Transplant Center</option>
                  <option value="Academic Medical & Transplant Hub">Academic Medical & Transplant Hub</option>
                  <option value="Regional Organ Procurement Institute">Regional Organ Procurement Institute</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Chief Transplant Coordinator
                </label>
                <input
                  type="text"
                  value={coordinatorName}
                  onChange={(e) => setCoordinatorName(e.target.value)}
                  placeholder="Dr. Coordinator Name"
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
                />
              </div>
            </div>
          )}
          {!isMock && (
            <div className="text-[11px] text-slate-500 ">
              The live hospital registry stores the institution name and geographic
              coordinates only. Accreditation tier, contact, and coordinator fields are
              mock-engine properties and are not sent.
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium tracking-wide bg-navy hover:bg-navy-dark text-white border border-transparent rounded-md transition-colors flex items-center gap-2"
            >
              {isSubmitting && (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              )}
              <span>{isEditing ? 'Save Changes' : 'Register Hospital'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
