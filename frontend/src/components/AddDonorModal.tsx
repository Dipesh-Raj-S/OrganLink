import React, { useState } from 'react';
import { BloodType, OrganType, Donor, LIVE_SUPPORTED_ORGANS } from '../types';
import { api, ApiError, isMockApiEnabled } from '../api/client';
import { ErrorMessage } from './ErrorMessage';

interface AddDonorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newDonor: Donor) => void;
  initialData?: Donor | null;
}

export const AddDonorModal: React.FC<AddDonorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}) => {
  const isEditing = !!initialData;
  // Live backend mode: forms must match the verified backend contract
  // (DonorCreate/DonorUpdate); mock mode keeps the original legacy form.
  const isMock = isMockApiEnabled();
  const [name, setName] = useState(initialData?.name || '');
  const [bloodType, setBloodType] = useState<BloodType>(initialData?.blood_type || 'O+');
  const [organType, setOrganType] = useState<OrganType>(initialData?.organ_type || 'Kidney');
  const [location, setLocation] = useState(initialData?.location || 'Boston, MA');
  const [latitude, setLatitude] = useState(
    initialData?.location_coordinates ? String(initialData.location_coordinates.latitude) : '42.3601'
  );
  const [longitude, setLongitude] = useState(
    initialData?.location_coordinates ? String(initialData.location_coordinates.longitude) : '-71.0589'
  );
  const [hospitalName, setHospitalName] = useState(initialData?.hospital_name || 'Massachusetts General Hospital');
  const [age, setAge] = useState(initialData?.age ? String(initialData.age) : '35');
  const [gender, setGender] = useState<'M' | 'F' | 'Other'>(initialData?.gender || 'M');
  const [expiryHours, setExpiryHours] = useState(
    initialData?.expiry_window_hours ? String(initialData.expiry_window_hours) : '24'
  );
  const [hlaType, setHlaType] = useState(initialData?.hla_type || 'A2, B44, DR4');
  const [medicalNotes, setMedicalNotes] = useState(initialData?.medical_notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | ApiError | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(new Error('Donor legal name is required'));
      return;
    }
    const parsedAge = parseInt(age, 10);
    if (isMock && (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 110)) {
      setError(new Error('Valid donor age is required (0-110)'));
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
      // Backend DonorBase: expiry_window_hours int ge=1 le=8760 (verified).
      const windowHours = Number(expiryHours);
      if (
        !Number.isInteger(windowHours) ||
        windowHours < 1 ||
        windowHours > 8760
      ) {
        setError(new Error('Viability window must be a whole number of hours (1-8760)'));
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const expiresAt = initialData?.expires_at
        ? initialData.expires_at
        : new Date(Date.now() + parseFloat(expiryHours) * 3600 * 1000).toISOString();

      // Legacy view-model payload (mock engine consumes this shape directly).
      const payload: Record<string, unknown> = {
        name: name.trim(),
        blood_type: bloodType,
        organ_type: organType,
        location: location.trim(),
        hospital_id: initialData?.hospital_id || 'H-001',
        hospital_name: hospitalName,
        age: parsedAge,
        gender,
        expires_at: expiresAt,
        hla_type: hlaType.trim(),
        medical_notes: medicalNotes.trim(),
        status: initialData?.status || 'AVAILABLE',
      };
      if (!isMock && coordinates) {
        payload.location_coordinates = coordinates;
        payload.expiry_window_hours = Math.round(parseFloat(expiryHours));
        delete payload.expires_at;
      }

      let result: Donor;
      if (isEditing && initialData) {
        result = await api.patch<Donor>(`/donors/${initialData.id}`, payload);
      } else {
        result = await api.post<Donor>('/donors', payload);
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
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="border-b border-slate-200 pb-3 mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy">
            {isEditing ? `Edit Donor ${initialData?.id}` : 'Register New Donor'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Donor Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Legal Name"
                className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
              />
            </div>

            {isMock ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Age *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="110"
                    required
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
                  >
                    <option value="M">Male (M)</option>
                    <option value="F">Female (F)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Latitude (-90..90) *
                  </label>
                  <input
                    type="text"
                    required
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="e.g. 42.3601"
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
                    placeholder="e.g. -71.0589"
                    className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                ABO Blood Type *
              </label>
              <select
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value as BloodType)}
                className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
              >
                <option value="O-">O- (Universal Donor)</option>
                <option value="O+">O+</option>
                <option value="A-">A-</option>
                <option value="A+">A+</option>
                <option value="B-">B-</option>
                <option value="B+">B+</option>
                <option value="AB-">AB-</option>
                <option value="AB+">AB+ (Universal Recipient)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Organ / Tissue Type *
              </label>
              <select
                value={organType}
                onChange={(e) => setOrganType(e.target.value as OrganType)}
                className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
              >
                <option value="Kidney">Kidney (Renal)</option>
                <option value="Liver">Liver (Hepatic)</option>
                <option value="Heart">Heart (Cardiac)</option>
                <option value="Lung">Lung (Pulmonary)</option>
                <option value="Pancreas">Pancreas</option>
                {isMock && (
                  <>
                    <option value="Cornea">Cornea (Ocular)</option>
                    <option value="Whole Blood">Whole Blood (Packed RBC)</option>
                    <option value="Platelets">Platelets (Apheresis)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {isMock ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Procurement Hospital
                </label>
                <input
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="Hospital Name"
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Location (City, State) *
                </label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Boston, MA"
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
                />
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 ">
              The live donor registry does not record a procurement hospital or free-text
              location; the coordinates above are stored as the donor's verified location.
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Viability Window (Hours) {isMock ? '' : '* (whole hours, 1-8760)'}
            </label>
            <input
              type="number"
              step={isMock ? '0.5' : '1'}
              min="1"
              max={isMock ? '720' : '8760'}
              required={!isMock || !isEditing}
              disabled={isMock && isEditing}
              value={expiryHours}
              onChange={(e) => setExpiryHours(e.target.value)}
              className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
            />
            {isMock && isEditing && (
              <span className="text-[11px] text-slate-500 ">
                Mock records keep their original expiry time when edited.
              </span>
            )}
          </div>

          {isMock && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  HLA Tissue Typing
                </label>
                <input
                  type="text"
                  value={hlaType}
                  onChange={(e) => setHlaType(e.target.value)}
                  placeholder="e.g. A2, B44, DR4"
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 "
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Clinical & Preservation Notes
                </label>
                <textarea
                  rows={3}
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                  placeholder="Cold ischemic time, perfusion parameters, laboratory baselines..."
                  className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
                />
              </div>
            </>
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
              <span>{isEditing ? 'Save Changes' : 'Register Donor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
