import React, { useState } from 'react';
import { Recipient } from '../types';
import { api, ApiError, isMockApiEnabled } from '../api/client';
import { ErrorMessage } from './ErrorMessage';

interface UpdateUrgencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipient: Recipient | null;
  onSuccess: (updated: Recipient) => void;
}

export const UpdateUrgencyModal: React.FC<UpdateUrgencyModalProps> = ({
  isOpen,
  onClose,
  recipient,
  onSuccess,
}) => {
  // Scale is explicit per mode: live backend scores 1-10 (verified in
  // RecipientUrgencyUpdate), the mock engine keeps its legacy 1-100 scale.
  const isMock = isMockApiEnabled();
  const maxScore = isMock ? 100 : 10;
  const [urgencyScore, setUrgencyScore] = useState<number>(
    Math.min(recipient?.urgency_score || (isMock ? 80 : 5), maxScore)
  );
  const [clinicalReason, setClinicalReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<Error | ApiError | null>(null);

  if (!isOpen || !recipient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (urgencyScore < 1 || urgencyScore > maxScore) {
      setError(new Error(`Urgency score must be a whole number between 1 and ${maxScore}`));
      return;
    }

    setIsSubmitting(true);
    try {
      // clinical_reason is a mock-engine field; the live RecipientUrgencyUpdate
      // schema accepts urgency_score only, so it is not sent in live mode.
      const body = isMock
        ? { urgency_score: urgencyScore, clinical_reason: clinicalReason }
        : { urgency_score: urgencyScore };
      const updated = await api.patch<Recipient>(`/recipients/${recipient.id}/urgency`, body);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityLabel = (score: number) => {
    if (isMock) {
      if (score >= 90) return { label: 'CRITICAL (Immediate allocation required)', color: 'text-red-600' };
      if (score >= 75) return { label: 'HIGH (Urgent transplant priority)', color: 'text-amber-700' };
      return { label: 'NORMAL (Standard waitlist status)', color: 'text-slate-600' };
    }
    // Live 1-10 thresholds (matching AddRecipientModal priority bands).
    if (score >= 9) return { label: 'CRITICAL (Immediate allocation required)', color: 'text-red-600' };
    if (score >= 8) return { label: 'HIGH (Urgent transplant priority)', color: 'text-amber-700' };
    return { label: 'NORMAL (Standard waitlist status)', color: 'text-slate-600' };
  };

  const priority = getPriorityLabel(urgencyScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg p-6">
        <div className="border-b border-slate-200 pb-3 mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-navy">
              Update Clinical Urgency Score
            </h3>
            <p className="text-xs text-slate-500">
              Recipient: {recipient.name} ({recipient.id})
            </p>
          </div>
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
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1 text-xs ">
            <div className="flex justify-between text-slate-500">
              <span>Organ Needed:</span>
              <span className="text-slate-900 font-semibold">{recipient.organ_needed}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Blood Group:</span>
              <span className="text-slate-900 font-semibold">{recipient.blood_type}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Current Score:</span>
              <span className="text-brand-ink font-semibold tabular-nums">{recipient.urgency_score} / {maxScore}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                New Urgency Score (1 - {maxScore})
              </label>
              <span className="text-sm font-medium text-brand-ink tabular-nums">
                {urgencyScore}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max={maxScore}
              step="1"
              value={urgencyScore}
              onChange={(e) => setUrgencyScore(parseInt(e.target.value, 10))}
              className="w-full accent-brand cursor-pointer"
            />
            <div className={`text-[11px] mt-1 ${priority.color}`}>
              {priority.label}
            </div>
          </div>

          {isMock && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Physician Rationale / MELD-PELD Updates *
              </label>
              <textarea
                required
                rows={3}
                value={clinicalReason}
                onChange={(e) => setClinicalReason(e.target.value)}
                placeholder="e.g. Acute decompensation, ICU admission with inotropic support, laboratory creatinine escalation..."
                className="w-full bg-white border border-slate-300 focus:border-brand rounded-md px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand/15 font-sans"
              />
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
              <span>Commit Urgency Score</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
