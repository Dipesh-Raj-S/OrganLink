export type UserRole = 'ADMIN' | 'COORDINATOR' | 'DOCTOR' | 'AUDITOR';

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

export type DonorStatus = 'AVAILABLE' | 'MATCHED' | 'ALLOCATED' | 'EXPIRED';

export type RecipientStatus = 'WAITING' | 'MATCHED' | 'TRANSPLANTED' | 'INACTIVE';

export type MatchRequestStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CONFLICT';

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
  hospital_id: string;
  hospital_name?: string;
  status: DonorStatus;
  registration_date: string;
  expires_at: string;
  age: number;
  gender: 'M' | 'F' | 'Other';
  hla_type?: string;
  medical_notes?: string;
}

export interface Recipient {
  id: string;
  name: string;
  blood_type: BloodType;
  organ_needed: OrganType;
  urgency_score: number; // 1 - 100
  hospital_id: string;
  hospital_name: string;
  waiting_list_date: string;
  status: RecipientStatus;
  age: number;
  gender: 'M' | 'F' | 'Other';
  location: string;
  contact_email?: string;
  clinical_priority?: 'NORMAL' | 'HIGH' | 'CRITICAL';
}

export interface Hospital {
  id: string;
  name: string;
  location: string;
  tier: string;
  contact_number: string;
  active_transplants: number;
  coordinator_name: string;
}

export interface MatchCandidate {
  donor_id: string;
  donor_name: string;
  blood_type: BloodType;
  organ_type: OrganType;
  distance_km: number;
  match_score: number; // 0 - 100
  donor_status: DonorStatus;
  expires_at: string;
  hospital_id: string;
  hospital_name: string;
  blood_compatibility: 'EXACT' | 'COMPATIBLE';
  hla_match_score?: number;
  crossmatch_result?: 'NEGATIVE' | 'POSITIVE';
}

export interface MatchRequest {
  id: string;
  donor_id: string;
  donor_name: string;
  donor_blood_type: BloodType;
  donor_organ: OrganType;
  recipient_id: string;
  recipient_name: string;
  recipient_hospital: string;
  requesting_hospital_id: string;
  requesting_hospital_name: string;
  match_score: number;
  request_date: string;
  status: MatchRequestStatus;
  urgency_at_request: number;
  notes?: string;
}

export interface Allocation {
  id: string;
  match_request_id: string;
  donor_id: string;
  donor_name: string;
  recipient_id: string;
  recipient_name: string;
  confirming_hospital_id: string;
  confirming_hospital_name: string;
  organ_type: OrganType;
  blood_type: BloodType;
  confirmation_date: string;
  transplant_status: 'SCHEDULED' | 'IN_TRANSIT' | 'COMPLETED';
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
  relationship:
    | 'DONATED_AT'
    | 'WAITING_AT'
    | 'MATCHED_TO'
    | 'ALLOCATED_BY'
    | 'TRANSFERRED_TO'
    | 'AFFILIATED_WITH';
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
    matched: number;
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
