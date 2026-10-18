import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, ApiError, isMockApiEnabled } from '../api/client';
import { Recipient, MatchCandidate, MatchRequest, PaginatedResponse, Donor } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';
import { ExpiryCountdown } from '../components/ExpiryCountdown';
import { CreateMatchModal } from '../components/CreateMatchModal';
import { RoleGuard } from '../auth/RoleGuard';

export const Matching: React.FC = () => {
  const { recipientId } = useParams<{ recipientId: string }>();
  const navigate = useNavigate();

  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [allRecipients, setAllRecipients] = useState<Recipient[]>([]);
  const [selectedCandidateForMatch, setSelectedCandidateForMatch] = useState<MatchCandidate | null>(null);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | ApiError | null>(null);

  // Reverse mode support: Search recipients for a specific donor
  const [isReverseMode, setIsReverseMode] = useState<boolean>(false);
  const [allDonors, setAllDonors] = useState<Donor[]>([]);
  const [selectedDonorId, setSelectedDonorId] = useState<string>('');
  const [reverseCandidates, setReverseCandidates] = useState<any[]>([]);

  // Load active recipient data and candidates
  const loadMatchingData = async (targetId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch recipient details
      const recList = await api.get<PaginatedResponse<Recipient>>('/recipients', { page_size: 100 });
      setAllRecipients(recList.items);

      const targetRec = recList.items.find((r) => r.id === targetId) || recList.items[0];
      setRecipient(targetRec || null);

      if (targetRec) {
        // 2. Fetch algorithmic candidates from backend
        const candRes = await api.get<PaginatedResponse<MatchCandidate>>(
          `/recipients/${targetRec.id}/candidates`
        );
        setCandidates(candRes.items);
      }
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadReverseData = async (donorId: string) => {
    if (!donorId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedResponse<any>>(`/donors/${donorId}/candidates`);
      setReverseCandidates(res.items);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (recipientId) {
      loadMatchingData(recipientId);
    } else {
      // If no ID passed in url, fetch first recipient
      api.get<PaginatedResponse<Recipient>>('/recipients', { page_size: 1 }).then((res) => {
        if (res.items.length > 0) {
          navigate(`/matching/${res.items[0].id}`, { replace: true });
        }
      });
    }
  }, [recipientId]);

  useEffect(() => {
    // Also preload donors if user switches to reverse view
    api.get<PaginatedResponse<Donor>>('/donors', { status: 'AVAILABLE', page_size: 50 }).then((res) => {
      setAllDonors(res.items);
      if (res.items.length > 0 && !selectedDonorId) {
        setSelectedDonorId(res.items[0].id);
      }
    });
  }, []);

  const handleRecipientSwitch = (newId: string) => {
    navigate(`/matching/${newId}`);
  };

  const handleMatchSuccess = (newMatch: MatchRequest) => {
    // Navigate to match requests page to inspect or confirm
    navigate('/match-requests', { state: { highlightId: newMatch.id } });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & View Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-base font-mono font-bold text-white uppercase tracking-wider">
            Algorithmic Compatibility Matching Engine
          </h1>
          <p className="text-xs text-slate-400 font-sans">
            {isMockApiEnabled()
              ? 'Automated ranking evaluating ABO blood compatibility, organ viability decay, geographic transit distance, and HLA matching.'
              : 'Backend ranking evaluates ABO compatibility (40%), recipient clinical urgency (35%), and transit distance (25%); each candidate row shows the backend score explanation.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 border border-slate-800 rounded-xs p-1 text-xs font-mono">
            <button
              type="button"
              onClick={() => setIsReverseMode(false)}
              className={`px-3 py-1 rounded-xs transition-colors ${
                !isReverseMode
                  ? 'bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Recipient View
            </button>
            <button
              type="button"
              onClick={() => {
                setIsReverseMode(true);
                if (selectedDonorId) loadReverseData(selectedDonorId);
              }}
              className={`px-3 py-1 rounded-xs transition-colors ${
                isReverseMode
                  ? 'bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Reverse Donor View
            </button>
          </div>
        </div>
      </div>

      <ErrorMessage error={error} onRetry={() => recipientId && loadMatchingData(recipientId)} />

      {!isReverseMode ? (
        /* STANDARD RECIPIENT -> CANDIDATE MATCHING */
        <div className="space-y-6">
          {/* Target Recipient Selector & Dossier Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-cyan-400 rounded-xs"></span>
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Target Recipient Patient File
                </span>
              </div>

              {/* Patient Selector Dropdown */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Select Patient:</span>
                <select
                  value={recipient?.id || ''}
                  onChange={(e) => handleRecipientSwitch(e.target.value)}
                  className="bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-2.5 py-1 text-cyan-300 font-mono font-bold text-xs outline-none"
                >
                  {allRecipients.map((r) => (
                    <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                      {r.name} ({r.id}) · {r.organ_needed} · {r.blood_type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {recipient && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Patient Name</span>
                  <span className="text-white font-semibold text-sm truncate block mt-0.5">
                    {recipient.name}
                  </span>
                  <span className="text-[10px] text-slate-400">ID: {recipient.id}</span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Organ Needed</span>
                  <span className="text-cyan-400 font-bold text-sm block mt-0.5">
                    {recipient.organ_needed}
                  </span>
                  <span className="text-[10px] text-slate-400">Required graft</span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Blood Group</span>
                  <span className="text-white font-bold text-sm block mt-0.5">
                    {recipient.blood_type}
                  </span>
                  <span className="text-[10px] text-slate-400">ABO Rh Profile</span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Urgency Score</span>
                  <span className="text-red-400 font-bold text-sm block mt-0.5 tabular-nums">
                    {recipient.urgency_score} / {recipient.urgency_denominator === 10 ? 10 : 100}
                  </span>
                  <span className="text-[10px] text-red-500/80">
                    {recipient.clinical_priority || (recipient.urgency_denominator === 10 ? 'Live scale: 1-10' : 'Priority')}
                  </span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Hospital Center</span>
                  <span className="text-slate-200 text-xs truncate block mt-0.5">
                    {recipient.hospital_name}
                  </span>
                  <span className="text-[10px] text-slate-400">{recipient.location}</span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xs">
                  <span className="text-[10px] text-slate-400 uppercase block">Waitlist Status</span>
                  <div className="mt-1">
                    <StatusBadge status={recipient.status} />
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Since {new Date(recipient.waiting_list_date).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Ranked Candidates Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Ranked Compatible Donor Candidates ({candidates.length} Found)
                </h2>
                <p className="text-[11px] text-slate-400 font-sans">
                  Candidates filtered by ABO compatibility, valid viability windows, and ranked by composite match algorithm.
                </p>
              </div>
            </div>

            {isLoading ? (
              <LoadingState message="Executing Cypher compatibility graph traversal..." rows={4} />
            ) : candidates.length === 0 ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xs space-y-2">
                <p className="text-xs font-mono text-slate-300 uppercase font-semibold">
                  No Compatible Donors Currently Available
                </p>
                <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                  No donors matching ABO compatibility for {recipient?.blood_type} with available {recipient?.organ_needed} organs within active viability thresholds were found.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {candidates.map((cand, index) => (
                  <div
                    key={cand.donor_id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xs transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Rank, Donor details */}
                      <div className="flex items-start gap-4">
                        <div className="w-9 h-9 bg-slate-950 border border-slate-800 rounded-xs flex items-center justify-center font-mono font-bold text-sm text-cyan-400 shrink-0">
                          #{index + 1}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white font-sans">
                              {cand.donor_name}
                            </span>
                            <span className="text-xs font-mono text-cyan-400 font-bold">
                              {cand.donor_id}
                            </span>
                            {cand.donor_status && <StatusBadge status={cand.donor_status} />}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-slate-400">
                            <span>
                              Organ: <span className="text-slate-200 font-semibold">{cand.organ_type}</span>
                            </span>
                            <span>
                              ABO: <span className="text-white font-bold">{cand.blood_type}</span>
                              {cand.blood_compatibility ? ` (${cand.blood_compatibility})` : ''}
                            </span>
                            {cand.hospital_name && (
                              <span>
                                Procurement: <span className="text-slate-300 font-sans">{cand.hospital_name}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Middle: Metrics (Distance, Expiry, HLA) */}
                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono bg-slate-950 p-2.5 rounded-xs border border-slate-850">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block">Distance</span>
                          <span className="text-slate-200 font-semibold tabular-nums">{cand.distance_km} km</span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block">Tissue Viability</span>
                          {cand.expires_at ? (
                            <ExpiryCountdown expiresAt={cand.expires_at} />
                          ) : (
                            <span className="text-slate-200 font-semibold tabular-nums">
                              {typeof cand.expiry_window_hours === 'number'
                                ? `${cand.expiry_window_hours}h window`
                                : '—'}
                            </span>
                          )}
                        </div>

                        {typeof cand.hla_match_score === 'number' && (
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase block">HLA Match</span>
                            <span className="text-emerald-400 font-semibold tabular-nums">
                              {cand.hla_match_score}%
                            </span>
                          </div>
                        )}

                        <div className="border-l border-slate-800 pl-3">
                          <span className="text-[10px] text-cyan-400 uppercase block font-bold">
                            Match Score
                          </span>
                          <span className="text-base font-bold text-emerald-400 tabular-nums">
                            {cand.match_score} pts
                          </span>
                        </div>
                      </div>

                      {/* Right: Action */}
                      <div className="flex items-center gap-2 shrink-0">
                        <RoleGuard allowed={['ADMIN', 'COORDINATOR', 'DOCTOR']}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCandidateForMatch(cand);
                              setIsMatchModalOpen(true);
                            }}
                            className="px-4 py-2 text-xs font-mono font-bold tracking-wider uppercase bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500 rounded-xs transition-colors whitespace-nowrap"
                          >
                            Create Match Request
                          </button>
                        </RoleGuard>
                      </div>
                    </div>

                    {/* Backend scoring rationale (live mode). Displayed verbatim; never fabricated. */}
                    {cand.explanation && (
                      <div className="mt-3 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 font-mono leading-relaxed">
                        <span className="text-cyan-500/80 uppercase">Score explanation:</span> {cand.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* REVERSE VIEW: Select Donor -> Find Waiting Recipients */
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-xs"></span>
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Select Donor Candidate for Reverse Recipient Match
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Available Donor:</span>
                <select
                  value={selectedDonorId}
                  onChange={(e) => {
                    setSelectedDonorId(e.target.value);
                    loadReverseData(e.target.value);
                  }}
                  className="bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xs px-2.5 py-1 text-cyan-300 font-mono font-bold text-xs outline-none"
                >
                  {allDonors.map((d) => (
                    <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                      {d.name} ({d.id}) · {d.organ_type} · {d.blood_type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              Querying reverse candidates for donors nearing organ procurement window. Displays waitlisted patients who match the donor's organ and ABO criteria.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Compatible Waitlisted Recipients ({reverseCandidates.length})
            </h2>

            {reverseCandidates.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xs">
                <p className="text-xs font-mono text-slate-400">No matching waitlist recipients</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {reverseCandidates.map((r) => (
                  <div
                    key={r.recipient_id}
                    className="p-3 bg-slate-900 border border-slate-800 rounded-xs flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{r.recipient_name}</span>
                        <span className="text-xs font-mono text-cyan-400">{r.recipient_id}</span>
                        <span className="text-xs font-mono font-bold text-white bg-slate-950 px-1.5 py-0.5 border border-slate-800 rounded-xs">
                          {r.blood_type}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        Hospital: {r.hospital_name || '—'} · Urgency:{' '}
                        <span className="text-red-400 font-bold">
                          {r.urgency_score}
                          {!isMockApiEnabled() ? ' /10' : ''}
                        </span>
                        {typeof r.distance_km === 'number' ? ` · ${r.distance_km} km` : ''} · Match:{' '}
                        <span className="text-emerald-400 font-bold">{r.match_score}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono font-bold text-emerald-400">
                        {r.match_score} pts
                      </span>
                      <Link
                        to={`/matching/${r.recipient_id}`}
                        className="px-3 py-1.5 text-xs font-mono font-bold bg-cyan-700 hover:bg-cyan-600 text-white rounded-xs"
                      >
                        Inspect Dossier
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formal Match Creation Modal */}
      {recipient && (
        <CreateMatchModal
          isOpen={isMatchModalOpen}
          recipient={recipient}
          candidate={selectedCandidateForMatch}
          onClose={() => {
            setIsMatchModalOpen(false);
            setSelectedCandidateForMatch(null);
          }}
          onSuccess={handleMatchSuccess}
        />
      )}
    </div>
  );
};
