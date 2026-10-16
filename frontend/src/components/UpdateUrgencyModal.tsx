import React, { useState } from 'react';
import { Recipient } from '../types';
import { api, ApiError } from '../api/client';
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
  const [urgencyScore, setUrgencyScore] = useState<number>(recipient?.urgency_score || 80);
  const [clinicalReason, setClinicalReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<Error | ApiError | null>(null);

  if (!isOpen || !recipient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (urgencyScore < 1 || urgencyScore > 100) {
      setError(new Error('Urgency score must be between 1 and 100'));
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await api.patch<Recipient>(`/recipients/${recipient.id}/urgency`, {
        urgency_score: urgencyScore,
        clinical_reason: clinicalReason,
      });
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityLabel = (score: number) => {
    if (score >= 90) return { label: 'CRITICAL (Immediate allocation required)', color: 'text-red-400' };
    if (score >= 75) return { label: 'HIGH (Urgent transplant priority)', color: 'text-amber-400' };
    return { label: 'NORMAL (Standard waitlist status)', color: 'text-slate-300' };
  };

  const priority = getPriorityLabel(urgencyScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xs shadow-2xl p-6">
        <div className="border-b border-slate-800 pb-3 mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              Update Clinical Urgency Score
            </h3>
            <p className="text-xs text-slate-400">
              Recipient: {recipient.name} ({recipient.id})
            </p>
          </div>
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
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs space-y-1 text-xs font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Organ Needed:</span>
              <span className="text-white font-semibold">{recipient.organ_needed}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Blood Group:</span>
              <span className="text-white font-semibold">{recipient.blood_type}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Current Score:</span>
              <span className="text-cyan-400 font-bold tabular-nums">{recipient.urgency_score} / 100</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-slate-300 uppercase">
                New Urgency Score (1 - 100)
              </label>
              <span className="text-sm font-mono font-bold text-cyan-400 tabular-nums">
                {urgencyScore}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={urgencyScore}
              onChange={(e) => setUrgencyScore(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <div className={`text-[11px] font-mono mt-1 ${priority.color}`}>
              {priority.label}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 uppercase mb-1">
              Physician Rationale / MELD-PELD Updates *
            </label>
            <textarea
              required
              rows={3}
              value={clinicalReason}
              onChange={(e) => setClinicalReason(e.target.value)}
              placeholder="e.g. Acute decompensation, ICU admission with inotropic support, laboratory creatinine escalation..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-3 py-1.5 text-xs text-white outline-none font-sans"
            />
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
              <span>Commit Urgency Score</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
