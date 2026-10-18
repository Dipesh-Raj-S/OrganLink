export type UserRole = 'ADMIN' | 'COORDINATOR' | 'DOCTOR' | 'AUDITOR';

// Canonical uppercase status codes used by the UI.
// Statuses marked (mock) exist only in the local mock engine; the live backend
// supports a subset whose verified values are listed in src/api/enums.ts.
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type OrganType =
  | 'Kidney'
  | 'Liver'
  | 'Heart'
  | 'Lung'
  | 'Pancreas'
  | 'Cornea'
  | 'Whole Blood'
  | 'Platelets';

export type DonorStatus = 'AVAILABLE' | 'MATCHED' | 'ALLOCATED' | 'EXPIRED' | 'RESERVED';

export type RecipientStatus = 'WAITING' | 'MATCHED' | 'TRANSPLANTED' | 'INACTIVE' | 'ALLOCATED';

export type MatchRequestStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CONFLICT' | 'CANCELLED';

/** Organ values supported by the live backend (verified in app/schemas/enums.py). */
export const LIVE_SUPPORTED_ORGANS = [
  'Kidney',
  'Liver',
  'Heart',
  'Lung',
  'Pancreas',
  'Blood',
] as const;

/** Geographic coordinates as stored by the live backend. */
export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export interface UserSession {
  access_token: string;
  role: UserRole;
  hospital_id: string;
  hospital_name: string;
  username: string;
  expires_in: number;
}

export interface Donor {
  id: string;
  name: string;
  blood_type: BloodType;
  organ_type: OrganType;
  location: string;
  /** Live-mode only: backend coordinates, used to pre-fill edit forms. */
  location_coordinates?: GeoLocation;
  hospital_id: string;
  hospital_name?: string;
  status: DonorStatus;
  registration_date: string;
  expires_at: string;
  age: number;
  gender: 'M' | 'F' | 'Other';
  hla_type?: string;
  medical_notes?: string;
  /** Live-mode only: viability window in hours reported by the backend. */
  expiry_window_hours?: number;
  /** Live-mode only: optimistic concurrency version reported by the backend. */
  version?: number;
}

export interface Recipient {
  id: string;
  name: string;
  blood_type: BloodType;
  organ_needed: OrganType;
  /** Live backend: 1-10 scale. Mock engine: 1-100. See urgency_denominator. */
  urgency_score: number;
  /** Denominator to display next to the urgency score (10 for live, 100 for mock). */
  urgency_denominator?: 10 | 100;
  hospital_id: string;
  hospital_name: string;
  waiting_list_date: string;
  status: RecipientStatus;
  age: number;
  gender: 'M' | 'F' | 'Other';
  location: string;
  /** Live-mode only: backend coordinates, used to pre-fill edit forms. */
  location_coordinates?: GeoLocation;
  contact_email?: string;
  clinical_priority?: 'NORMAL' | 'HIGH' | 'CRITICAL';
}

export interface Hospital {
  id: string;
  name: string;
  location: string;
  /** Live-mode only: backend coordinates. */
  location_coordinates?: GeoLocation;
  tier?: string;
  contact_number?: string;
  active_transplants?: number;
  coordinator_name?: string;
}

export interface MatchCandidate {
  donor_id: string;
  donor_name: string;
  blood_type: BloodType;
  organ_type: OrganType;
  distance_km: number;
  /** Backend-computed rank score (live) or mock score. Never computed in React. */
  match_score: number;
  donor_status?: DonorStatus;
  /** Mock only. Live mode derives expiry display from expiry_window_hours. */
  expires_at?: string;
  /** Live mode: viability window in hours reported by the backend. */
  expiry_window_hours?: number;
  hospital_id?: string;
  hospital_name?: string;
  blood_compatibility?: 'EXACT' | 'COMPATIBLE';
  /** Mock only — the live backend does not provide HLA or crossmatch data. */
  hla_match_score?: number;
  crossmatch_result?: 'NEGATIVE' | 'POSITIVE';
  /** Live mode: human-readable backend scoring rationale. */
  explanation?: string;
}

export interface MatchRequest {
  id: string;
  donor_id: string;
  donor_name?: string;
  donor_blood_type?: BloodType;
  donor_organ?: OrganType;
  recipient_id: string;
  recipient_name?: string;
  recipient_hospital?: string;
  requesting_hospital_id: string;
  requesting_hospital_name?: string;
  match_score: number;
  request_date: string;
  status: MatchRequestStatus;
  urgency_at_request?: number;
  notes?: string;
}

export interface Allocation {
  id: string;
  match_request_id: string;
  donor_id: string;
  donor_name?: string;
  recipient_id: string;
  recipient_name?: string;
  confirming_hospital_id: string;
  confirming_hospital_name?: string;
  organ_type?: OrganType;
  blood_type?: BloodType;
  confirmation_date: string;
  /** Mock: transplant status. Live: backend allocation status (Confirmed/Cancelled). */
  transplant_status: string;
  allocated_by?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'DONOR' | 'RECIPIENT' | 'HOSPITAL' | 'MATCH_REQUEST' | 'ALLOCATION';
  properties: Record<string, any>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /**
   * Actual Neo4j relationship name.
   * Live backend: PROPOSED_IN, FOR_RECIPIENT, REQUESTED_BY, ALLOCATED_IN,
   * TO_RECIPIENT, CONFIRMED_BY, REGISTERED_AT, HAS_BLOOD_TYPE.
   * Mock engine uses its own display names.
   */
  relationship: string;
}

export interface MatchGraphData {
  match_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DashboardStats {
  total_donors: number;
  available_donors: number;
  total_recipients_waiting: number;
  confirmed_allocations: number;
  donors_approaching_expiry: number;
  status_breakdown: {
    available: number;
    /** Live backend: donors with Reserved status. */
    reserved?: number;
    /** Mock only: the live backend has no 'MATCHED' donor status. */
    matched?: number;
    allocated: number;
    expired: number;
  };
  organ_breakdown: Record<string, number>;
  blood_type_distribution: Record<string, number>;
  recent_allocations: Allocation[];
  urgent_recipients: Recipient[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
