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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xs shadow-2xl p-6">
        <div className="border-b border-slate-800 pb-3 mb-4 flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
            Initiate Formal Match Request
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
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            {/* Recipient Card */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs space-y-1">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest">Recipient Target</div>
              <div className="text-white font-semibold text-sm truncate">{recipient.name}</div>
              <div className="text-slate-400">ID: {recipient.id}</div>
              <div className="text-slate-400">Organ: <span className="text-cyan-400">{recipient.organ_needed}</span></div>
              <div className="text-slate-400">ABO: <span className="text-white font-bold">{recipient.blood_type}</span></div>
              <div className="text-slate-400">Hospital: <span className="text-slate-300 truncate block">{recipient.hospital_name}</span></div>
            </div>

            {/* Candidate Donor Card */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs space-y-1">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest">Candidate Donor</div>
              <div className="text-white font-semibold text-sm truncate">{candidate.donor_name}</div>
              <div className="text-slate-400">ID: {candidate.donor_id}</div>
              <div className="text-slate-400">Match Score: <span className="text-emerald-400 font-bold">{candidate.match_score} pts</span></div>
              <div className="text-slate-400">ABO: <span className="text-white font-bold">{candidate.blood_type}</span>{candidate.blood_compatibility ? ` (${candidate.blood_compatibility})` : ''}</div>
              <div className="text-slate-400">Distance: <span className="text-slate-300 font-mono">{candidate.distance_km} km</span></div>
            </div>
          </div>

          {isMock ? (
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
                Clinical Justification & Logistics Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Crossmatch preliminary negative. Emergency transport team alerted. Flight transit estimated at 55 minutes."
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-sans"
              />
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 font-mono">
              Live match requests persist donor and recipient identifiers only; the
              backend recomputes and stores the official match score itself.
            </div>
          )}

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
              <span>Submit Match Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
