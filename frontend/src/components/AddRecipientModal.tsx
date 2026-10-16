import React, { useState } from 'react';
import { BloodType, OrganType, Recipient } from '../types';
import { api, ApiError } from '../api/client';
import { ErrorMessage } from './ErrorMessage';

interface AddRecipientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newRecipient: Recipient) => void;
  initialData?: Recipient | null;
}

export const AddRecipientModal: React.FC<AddRecipientModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}) => {
  const isEditing = !!initialData;
  const [name, setName] = useState(initialData?.name || '');
  const [bloodType, setBloodType] = useState<BloodType>(initialData?.blood_type || 'A+');
  const [organNeeded, setOrganNeeded] = useState<OrganType>(initialData?.organ_needed || 'Kidney');
  const [urgencyScore, setUrgencyScore] = useState(initialData?.urgency_score ? String(initialData.urgency_score) : '85');
  const [hospitalName, setHospitalName] = useState(initialData?.hospital_name || 'Massachusetts General Hospital');
  const [location, setLocation] = useState(initialData?.location || 'Boston, MA');
  const [age, setAge] = useState(initialData?.age ? String(initialData.age) : '45');
  const [gender, setGender] = useState<'M' | 'F' | 'Other'>(initialData?.gender || 'F');
  const [contactEmail, setContactEmail] = useState(initialData?.contact_email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | ApiError | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(new Error('Recipient legal name is required'));
      return;
    }
    const parsedScore = parseInt(urgencyScore, 10);
    if (isNaN(parsedScore) || parsedScore < 1 || parsedScore > 100) {
      setError(new Error('Urgency score must be between 1 and 100'));
      return;
    }
    const parsedAge = parseInt(age, 10);
    if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 110) {
      setError(new Error('Valid age between 0 and 110 is required'));
      return;
    }

    setIsSubmitting(true);
    try {
      let clinicalPriority: 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL';
      if (parsedScore >= 90) clinicalPriority = 'CRITICAL';
      else if (parsedScore >= 75) clinicalPriority = 'HIGH';

      const payload = {
        name: name.trim(),
        blood_type: bloodType,
        organ_needed: organNeeded,
        urgency_score: parsedScore,
        hospital_id: initialData?.hospital_id || 'H-001',
        hospital_name: hospitalName,
        location: location.trim(),
        age: parsedAge,
        gender,
        contact_email: contactEmail.trim(),
        clinical_priority: clinicalPriority,
        status: initialData?.status || 'WAITING',
      };

      let result: Recipient;
      if (isEditing && initialData) {
        result = await api.patch<Recipient>(`/recipients/${initialData.id}`, payload);
      } else {
        result = await api.post<Recipient>('/recipients', payload);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xs shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="border-b border-slate-800 pb-3 mb-4 flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
            {isEditing ? `Edit Recipient ${initialData?.id}` : 'Enroll Recipient to Waitlist'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white font-mono text-xs"
          >
            [ESC]
          </button>
        </div>

        <ErrorMessage error={error} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Recipient Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Legal Name"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-sans"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                  Age *
                </label>
                <input
                  type="number"
                  min="0"
                  max="110"
                  required
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-mono"
                >
                  <option value="M">Male (M)</option>
                  <option value="F">Female (F)</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                ABO Blood Type *
              </label>
              <select
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value as BloodType)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-mono"
              >
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

            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Organ Needed *
              </label>
              <select
                value={organNeeded}
                onChange={(e) => setOrganNeeded(e.target.value as OrganType)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-mono"
              >
                <option value="Kidney">Kidney (Renal)</option>
                <option value="Liver">Liver (Hepatic)</option>
                <option value="Heart">Heart (Cardiac)</option>
                <option value="Lung">Lung (Pulmonary)</option>
                <option value="Pancreas">Pancreas</option>
                <option value="Cornea">Cornea (Ocular)</option>
                <option value="Whole Blood">Whole Blood (Packed RBC)</option>
                <option value="Platelets">Platelets (Apheresis)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Urgency Score (1 - 100) *
              </label>
              <input
                type="number"
                min="1"
                max="100"
                required
                value={urgencyScore}
                onChange={(e) => setUrgencyScore(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-mono"
              />
              <span className="text-[10px] text-slate-400 font-mono">
                {parseInt(urgencyScore, 10) >= 90
                  ? 'CRITICAL (Emergency)'
                  : parseInt(urgencyScore, 10) >= 75
                  ? 'HIGH (Urgent priority)'
                  : 'NORMAL (Standard priority)'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Location (City, State) *
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Boston, MA"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-sans"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Transplant Center / Hospital
              </label>
              <input
                type="text"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="Hospital Name"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-sans"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="coordinator@hospital.org"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-sans"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium tracking-wide bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 rounded-xs transition-colors flex items-center gap-2"
            >
              {isSubmitting && (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              )}
              <span>{isEditing ? 'Save Changes' : 'Enroll Recipient'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
