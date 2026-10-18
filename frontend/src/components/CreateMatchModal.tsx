import React, { useState } from 'react';
import { Recipient, MatchCandidate, MatchRequest } from '../types';
import { api, ApiError, isMockApiEnabled } from '../api/client';
import { ErrorMessage } from './ErrorMessage';

interface CreateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipient: Recipient;
  candidate: MatchCandidate | null;
  onSuccess: (newMatch: MatchRequest) => void;
}

export const CreateMatchModal: React.FC<CreateMatchModalProps> = ({
  isOpen,
  onClose,
  recipient,
  candidate,
  onSuccess,
}) => {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | ApiError | null>(null);
  const isMock = isMockApiEnabled();

  if (!isOpen || !candidate) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Live backend MatchRequestCreate accepts donor_id/recipient_id only —
      // scores are computed by the backend; notes are a mock-engine field.
      const match = await api.post<MatchRequest>('/match-requests', {
        recipient_id: recipient.id,
        donor_id: candidate.donor_id,
        ...(isMock
          ? {
              match_score: candidate.match_score,
              notes: notes || `Direct match request initiated`,
            }
          : {}),
      });
      onSuccess(match);
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
            Initiate Formal Match Request
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
          <div className="grid grid-cols-2 gap-3 text-xs ">
            {/* Recipient Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
              <div className="text-[11px] font-medium text-slate-500">Recipient Target</div>
              <div className="text-slate-900 font-semibold text-sm truncate">{recipient.name}</div>
              <div className="text-slate-500">ID: {recipient.id}</div>
              <div className="text-slate-500">Organ: <span className="text-brand-ink">{recipient.organ_needed}</span></div>
              <div className="text-slate-500">ABO: <span className="text-slate-900 font-semibold">{recipient.blood_type}</span></div>
              <div className="text-slate-500">Hospital: <span className="text-slate-600 truncate block">{recipient.hospital_name}</span></div>
            </div>

            {/* Candidate Donor Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
              <div className="text-[11px] font-medium text-slate-500">Candidate Donor</div>
              <div className="text-slate-900 font-semibold text-sm truncate">{candidate.donor_name}</div>
              <div className="text-slate-500">ID: {candidate.donor_id}</div>
              <div className="text-slate-500">Match Score: <span className="text-emerald-700 font-bold">{candidate.match_score} pts</span></div>
              <div className="text-slate-500">ABO: <span className="text-slate-900 font-semibold">{candidate.blood_type}</span>{candidate.blood_compatibility ? ` (${candidate.blood_compatibility})` : ''}</div>
              <div className="text-slate-500">Distance: <span className="text-slate-600 ">{candidate.distance_km} km</span></div>
            </div>
          </div>

          {isMock ? (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Clinical Justification & Logistics Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Crossmatch preliminary negative. Emergency transport team alerted. Flight transit estimated at 55 minutes."
                className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
              />
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 ">
              Live match requests persist donor and recipient identifiers only; the
              backend recomputes and stores the official match score itself.
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
              <span>Submit Match Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
