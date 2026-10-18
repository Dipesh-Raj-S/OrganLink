/**
 * API adapters: explicit, verified mappings between the FastAPI backend schema
 * and the frontend view model.
 *
 * Rules encoded here:
 * - Backend responses are mapped into the frontend view model; nothing in the
 *   UI fabricates data that the backend does not provide (mock-only fields are
 *   left undefined in live mode instead).
 * - Request payloads sent TO the backend contain only fields the backend
 *   actually accepts (verified against backend/app/schemas).
 * - Enum translation happens exclusively through src/api/enums.ts.
 */

import {
  Allocation,
  BloodType,
  DashboardStats,
  Donor,
  GeoLocation,
  Hospital,
  MatchCandidate,
  MatchRequest,
  Recipient,
} from '../types';
import {
  allocationStatusToUi,
  donorStatusToUi,
  matchRequestStatusToUi,
  recipientStatusToUi,
  uiDonorStatusToBackend,
  uiMatchRequestStatusToBackend,
  uiRecipientStatusToBackend,
} from './enums';

// ---------------------------------------------------------------------------
// Shared contract types (mirror of the actual backend Pydantic schemas)
// ---------------------------------------------------------------------------

/** Mirror of backend LocationSchema. */
export interface BackendLocation {
  latitude: number;
  longitude: number;
}

/** Mirror of backend DonorResponse. */
export interface BackendDonor {
  donor_id: string;
  name: string;
  blood_type: string;
  organ_type: string;
  location: BackendLocation;
  status: string;
  registered_at: string;
  expiry_window_hours: number;
  version: number;
}

/** Mirror of backend RecipientResponse. */
export interface BackendRecipient {
  recipient_id: string;
  name: string;
  blood_type: string;
  organ_needed: string;
  urgency_score: number;
  location: BackendLocation;
  waitlist_since: string;
  status: string;
  hospital_id: string;
}

/** Mirror of backend HospitalResponse. */
export interface BackendHospital {
  hospital_id: string;
  name: string;
  location: BackendLocation;
}

/** Mirror of backend CandidateDonorResponse + MatchExplanation. */
export interface BackendCandidateDonor {
  donor_id: string;
  name: string;
  blood_type: string;
  organ_type: string;
  donor_location: BackendLocation;
  expiry_window_hours: number;
  score: number;
  eligible: boolean;
  explanation: {
    summary: string;
    factors: {
      blood_compatibility_score: number;
      urgency_score_component: number;
      distance_score_component: number;
      distance_km: number;
      weights: Record<string, number>;
    };
    disclaimer: string;
  };
}

/** Mirror of backend CandidateListResponse. */
export interface BackendCandidateList {
  recipient_id: string;
  recipient_name: string;
  organ_needed: string;
  recipient_blood_type: string;
  urgency_score: number;
  hospital_id: string;
  items: BackendCandidateDonor[];
  total: number;
  page: number;
  page_size: number;
}

/** Mirror of backend MatchRequestResponse. */
export interface BackendMatchRequest {
  match_id: string;
  match_score: number;
  requested_at: string;
  status: string;
  donor_id: string;
  recipient_id: string;
  hospital_id: string;
}

/** Mirror of backend AllocationResponse. */
export interface BackendAllocation {
  allocation_id: string;
  match_id: string;
  donor_id: string;
  recipient_id: string;
  hospital_id: string;
  allocated_by: string;
  confirmed_at: string;
  status: string;
}

/** Mirror of backend PaginatedResponse envelope. */
export interface BackendPaginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** Mirror of backend TokenResponse. */
export interface BackendTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Mirror of backend UserResponse. */
export interface BackendUserResponse {
  user_id: string;
  username: string;
  role: string;
  is_active: boolean;
  hospital_id?: string | null;
}

/** Mirror of backend MatchGraphResponse (graph visualization endpoint). */
export interface BackendMatchGraph {
  match_id: string;
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    properties: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relationship: string;
  }>;
}

/** Mirror of backend ReverseCandidateListResponse (reverse donor discovery). */
export interface BackendReverseCandidateList {
  donor_id: string;
  donor_name: string;
  organ_type: string;
  donor_blood_type: string;
  items: Array<{
    recipient_id: string;
    name: string;
    blood_type: string;
    organ_needed: string;
    urgency_score: number;
    hospital_id: string;
    distance_km: number;
    score: number;
    eligible: boolean;
  }>;
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Renders backend coordinates as a readable display string. */
export function formatGeoLocation(loc: BackendLocation | null | undefined): string {
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    return 'Unknown';
  }
  return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
}

/**
 * Derives an indicative donor expiry timestamp for the UI countdown.
 *
 * LABELLED DISPLAY CALCULATION ONLY: registered_at + expiry_window_hours.
 * Both inputs come from the backend response; nothing else is invented.
 */
export function deriveDonorExpiry(registeredAtIso: string, expiryWindowHours: number): string {
  const base = Date.parse(registeredAtIso);
  const hours = Number.isFinite(expiryWindowHours) ? expiryWindowHours : 0;
  if (!Number.isFinite(base)) return '';
  return new Date(base + hours * 3600 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Lookup cache for name enrichment (builders use REAL list endpoints only)
// ---------------------------------------------------------------------------

interface EntityNameCaches {
  hospitals: Map<string, string>;
  donors: Map<string, BackendDonor>;
  recipients: Map<string, BackendRecipient>;
}

export class LookupProvider {
  private caches: EntityNameCaches = {
    hospitals: new Map(),
    donors: new Map(),
    recipients: new Map(),
  };

  /** Raw live-API GET (no view-model adapters), injected by client.ts */
  private rawGet: <T>(
    endpoint: string,
    params?: Record<string, string | number | undefined>
  ) => Promise<T>;

  constructor(opts: {
    rawGet: <T>(
      endpoint: string,
      params?: Record<string, string | number | undefined>
    ) => Promise<T>;
  }) {
    this.rawGet = opts.rawGet;
  }

  async hospitalName(hospitalId: string | null | undefined): Promise<string | undefined> {
    if (!hospitalId) return undefined;
    if (this.caches.hospitals.size === 0) {
      // Straight through the raw list endpoint; backend max page_size is 100.
      const res = await this.rawGet<BackendPaginated<BackendHospital>>('/hospitals', {
        page_size: 100,
      });
      res.items.forEach((h) => {
        this.caches.hospitals.set(h.hospital_id, h.name);
      });
    }
    return this.caches.hospitals.get(hospitalId);
  }

  async donorById(donorId: string): Promise<BackendDonor | undefined> {
    if (this.caches.donors.size === 0) {
      const res = await this.rawGet<BackendPaginated<BackendDonor>>('/donors', {
        page_size: 100,
      });
      res.items.forEach((d) => {
        this.caches.donors.set(d.donor_id, d);
      });
    }
    return this.caches.donors.get(donorId);
  }

  async recipientById(recipientId: string): Promise<BackendRecipient | undefined> {
    if (this.caches.recipients.size === 0) {
      const res = await this.rawGet<BackendPaginated<BackendRecipient>>('/recipients', {
        page_size: 100,
      });
      res.items.forEach((r) => {
        this.caches.recipients.set(r.recipient_id, r);
      });
    }
    return this.caches.recipients.get(recipientId);
  }
}

// ---------------------------------------------------------------------------
// Donors
// ---------------------------------------------------------------------------

export function backendDonorToFrontend(
  d: BackendDonor,
  hospitalName?: string
): Donor {
  const status = donorStatusToUi(d.status) as Donor['status'];
  return {
    id: d.donor_id,
    name: d.name,
    blood_type: d.blood_type as BloodType,
    organ_type: d.organ_type as Donor['organ_type'],
    location: formatGeoLocation(d.location),
    location_coordinates: d.location,
    // The live backend does not link donors to procurement hospitals in its
    // public response; the UI shows backend coordinates instead.
    hospital_id: '',
    status,
    registration_date: d.registered_at,
    // Display-only estimate; UI labels it as derived from the viability window.
    expires_at: deriveDonorExpiry(d.registered_at, d.expiry_window_hours),
    age: NaN,
    gender: 'Other',
    hospital_name: hospitalName,
    expiry_window_hours: d.expiry_window_hours,
    version: d.version,
  };
}

export interface DonorFormPayload {
  name: string;
  blood_type: string;
  organ_type: string;
  location: string;
  location_coordinates?: GeoLocation;
  hospital_id?: string;
  hospital_name?: string;
  status?: string;
  expiry_window_hours?: number;
}

/** Maps the UI donor form payload to backend DonorCreate (only accepted fields). */
export function frontendDonorToBackendCreate(
  payload: DonorFormPayload,
  isMock: boolean
): Record<string, unknown> {
  if (isMock) {
    // Mock engine keeps the full legacy payload shape.
    return { ...payload };
  }
  const coords = payload.location_coordinates;
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
    throw new Error(
      'Latitude and longitude are required to register a donor in live mode.'
    );
  }
  if (
    payload.expiry_window_hours == null ||
    !Number.isInteger(payload.expiry_window_hours) ||
    payload.expiry_window_hours < 1 ||
    payload.expiry_window_hours > 8760
  ) {
    throw new Error('Viability window must be a whole number of hours between 1 and 8760.');
  }
  const body: Record<string, unknown> = {
    name: payload.name,
    blood_type: payload.blood_type,
    organ_type: payload.organ_type,
    location: { latitude: coords.latitude, longitude: coords.longitude },
    expiry_window_hours: Math.round(payload.expiry_window_hours),
  };
  if (payload.status) {
    body.status = uiDonorStatusToBackend(payload.status);
  }
  return body;
}

/** Maps the UI donor form payload to backend DonorUpdate (only accepted fields). */
export function frontendDonorToBackendUpdate(
  payload: DonorFormPayload,
  isMock: boolean
): Record<string, unknown> {
  if (isMock) {
    return { ...payload };
  }
  const body: Record<string, unknown> = {
    name: payload.name,
    blood_type: payload.blood_type,
    organ_type: payload.organ_type,
  };
  if (payload.location_coordinates) {
    body.location = {
      latitude: payload.location_coordinates.latitude,
      longitude: payload.location_coordinates.longitude,
    };
  }
  if (payload.status) {
    body.status = uiDonorStatusToBackend(payload.status);
  }
  if (payload.expiry_window_hours != null) {
    body.expiry_window_hours = Math.round(payload.expiry_window_hours);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

export function backendRecipientToFrontend(
  r: BackendRecipient,
  hospitalName?: string
): Recipient {
  return {
    id: r.recipient_id,
    name: r.name,
    blood_type: r.blood_type as BloodType,
    organ_needed: r.organ_needed as Recipient['organ_needed'],
    urgency_score: r.urgency_score,
    urgency_denominator: 10,
    hospital_id: r.hospital_id || '',
    hospital_name: hospitalName || '',
    waiting_list_date: r.waitlist_since,
    status: recipientStatusToUi(r.status) as Recipient['status'],
    age: NaN,
    gender: 'Other',
    location: formatGeoLocation(r.location),
    location_coordinates: r.location,
  };
}

export interface RecipientFormPayload {
  name: string;
  blood_type: string;
  organ_needed: string;
  urgency_score: number;
  hospital_id?: string;
  hospital_name?: string;
  location: string;
  location_coordinates?: GeoLocation;
  status?: string;
}

/** Maps the UI recipient form payload to backend RecipientCreate. */
export function frontendRecipientToBackendCreate(
  payload: RecipientFormPayload,
  isMock: boolean
): Record<string, unknown> {
  if (isMock) {
    return { ...payload };
  }
  const coords = payload.location_coordinates;
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
    throw new Error(
      'Latitude and longitude are required to register a recipient in live mode.'
    );
  }
  if (
    !Number.isInteger(payload.urgency_score) ||
    payload.urgency_score < 1 ||
    payload.urgency_score > 10
  ) {
    throw new Error('Urgency score must be a whole number between 1 and 10.');
  }
  if (!payload.hospital_id) {
    throw new Error('A registering hospital is required.');
  }
  const body: Record<string, unknown> = {
    name: payload.name,
    blood_type: payload.blood_type,
    organ_needed: payload.organ_needed,
    urgency_score: payload.urgency_score,
    hospital_id: payload.hospital_id,
    location: { latitude: coords.latitude, longitude: coords.longitude },
  };
  if (payload.status) {
    body.status = uiRecipientStatusToBackend(payload.status);
  }
  return body;
}

export function frontendRecipientToBackendUpdate(
  payload: RecipientFormPayload,
  isMock: boolean
): Record<string, unknown> {
  if (isMock) {
    return { ...payload };
  }
  const body: Record<string, unknown> = {
    name: payload.name,
    blood_type: payload.blood_type,
    organ_needed: payload.organ_needed,
    urgency_score: payload.urgency_score,
  };
  if (payload.hospital_id) {
    body.hospital_id = payload.hospital_id;
  }
  if (payload.location_coordinates) {
    body.location = {
      latitude: payload.location_coordinates.latitude,
      longitude: payload.location_coordinates.longitude,
    };
  }
  return body;
}

// ---------------------------------------------------------------------------
// Hospitals
// ---------------------------------------------------------------------------

export function backendHospitalToFrontend(h: BackendHospital): Hospital {
  return {
    id: h.hospital_id,
    name: h.name,
    location: formatGeoLocation(h.location),
    location_coordinates: h.location,
    tier: undefined,
    contact_number: undefined,
    active_transplants: undefined,
    coordinator_name: undefined,
  };
}

export interface HospitalFormPayload {
  name: string;
  location: string;
  location_coordinates?: GeoLocation;
  tier?: string;
  contact_number?: string;
  coordinator_name?: string;
}

export function frontendHospitalToBackendCreate(
  payload: HospitalFormPayload,
  isMock: boolean
): Record<string, unknown> {
  if (isMock) {
    return { ...payload };
  }
  const coords = payload.location_coordinates;
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
    throw new Error(
      'Latitude and longitude are required to register a hospital in live mode.'
    );
  }
  return {
    name: payload.name,
    location: { latitude: coords.latitude, longitude: coords.longitude },
  };
}

export function frontendHospitalToBackendUpdate(
  payload: HospitalFormPayload,
  isMock: boolean
): Record<string, unknown> {
  if (isMock) {
    return { ...payload };
  }
  const body: Record<string, unknown> = { name: payload.name };
  if (payload.location_coordinates) {
    body.location = {
      latitude: payload.location_coordinates.latitude,
      longitude: payload.location_coordinates.longitude,
    };
  }
  return body;
}

// ---------------------------------------------------------------------------
// Candidates (matching engine — scores are always backend-computed)
// ---------------------------------------------------------------------------

export function backendCandidateToFrontend(c: BackendCandidateDonor): MatchCandidate {
  return {
    donor_id: c.donor_id,
    donor_name: c.name,
    blood_type: c.blood_type as BloodType,
    organ_type: c.organ_type as MatchCandidate['organ_type'],
    distance_km: c.explanation.factors.distance_km,
    match_score: c.score,
    donor_status: undefined,
    expires_at: undefined,
    expiry_window_hours: c.expiry_window_hours,
    hospital_id: undefined,
    hospital_name: undefined,
    blood_compatibility: undefined,
    hla_match_score: undefined,
    crossmatch_result: undefined,
    explanation: c.explanation.summary,
  };
}

// ---------------------------------------------------------------------------
// Reverse candidates (donor -> waiting recipients)
// ---------------------------------------------------------------------------

export interface ReverseCandidateView {
  recipient_id: string;
  recipient_name: string;
  blood_type: string;
  urgency_score: number;
  hospital_name?: string;
  distance_km: number;
  match_score: number;
}

export function backendReverseCandidatesToFrontend(
  list: BackendReverseCandidateList
): ReverseCandidateView[] {
  return list.items.map((r) => ({
    recipient_id: r.recipient_id,
    recipient_name: r.name,
    blood_type: r.blood_type,
    urgency_score: r.urgency_score,
    distance_km: r.distance_km,
    match_score: r.score,
  }));
}

// ---------------------------------------------------------------------------
// Match requests
// ---------------------------------------------------------------------------

export function backendMatchRequestToFrontend(
  m: BackendMatchRequest,
  donor?: BackendDonor,
  hospitalName?: string
): MatchRequest {
  return {
    id: m.match_id,
    match_score: m.match_score,
    request_date: m.requested_at,
    status: matchRequestStatusToUi(m.status) as MatchRequest['status'],
    donor_id: m.donor_id,
    recipient_id: m.recipient_id,
    requesting_hospital_id: m.hospital_id,
    donor_name: donor?.name,
    donor_blood_type: donor?.blood_type as BloodType | undefined,
    donor_organ: donor?.organ_type as MatchRequest['donor_organ'],
    recipient_name: undefined,
    recipient_hospital: undefined,
    requesting_hospital_name: hospitalName,
    notes: undefined,
  };
}

export interface MatchRequestCreatePayload {
  donor_id: string;
  recipient_id: string;
  /** UI-only clinical notes; the live backend does not persist these. */
  notes?: string;
}

/** Maps the UI create-match payload to backend MatchRequestCreate. */
export function frontendMatchRequestToBackendCreate(
  payload: MatchRequestCreatePayload,
  isMock: boolean
): Record<string, unknown> {
  if (isMock) {
    return {
      recipient_id: payload.recipient_id,
      donor_id: payload.donor_id,
      notes: payload.notes || `Direct match request initiated`,
    };
  }
  // Backend accepts match_id?, donor_id, recipient_id, hospital_id? — nothing else.
  return {
    donor_id: payload.donor_id,
    recipient_id: payload.recipient_id,
  };
}

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

export function backendAllocationToFrontend(
  a: BackendAllocation,
  donor?: BackendDonor,
  recipientName?: string,
  hospitalName?: string
): Allocation {
  return {
    id: a.allocation_id,
    match_request_id: a.match_id,
    donor_id: a.donor_id,
    donor_name: donor?.name,
    recipient_id: a.recipient_id,
    recipient_name: recipientName,
    confirming_hospital_id: a.hospital_id,
    confirming_hospital_name: hospitalName,
    organ_type: donor?.organ_type as Allocation['organ_type'],
    blood_type: donor?.blood_type as Allocation['blood_type'],
    confirmation_date: a.confirmed_at,
    transplant_status: allocationStatusToUi(a.status),
    allocated_by: a.allocated_by || undefined,
  };
}

export function allocateMatchRequestPayload(): Record<string, unknown> {
  // Backend accepts an optional { donor_id } override; omitting it uses the
  // donor linked to the match request, which is the intended UI flow.
  return {};
}

// ---------------------------------------------------------------------------
// Match request status filter translation (UI uppercase -> backend casing)
// ---------------------------------------------------------------------------

export function translateRequestStatusFilter(status: string): string {
  return uiMatchRequestStatusToBackend(status);
}

// Re-export enum translators so the API client imports every mapping from one place.
export {
  donorStatusToUi,
  uiDonorStatusToBackend,
  uiRecipientStatusToBackend,
  uiMatchRequestStatusToBackend,
} from './enums';
