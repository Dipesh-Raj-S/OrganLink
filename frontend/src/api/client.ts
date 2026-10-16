import {
  loadDatabase,
  saveDatabase,
  resetDatabase,
  computeCandidatesForRecipient,
  generateGraphForMatch,
} from './mockData';
import {
  Donor,
  Recipient,
  Hospital,
  MatchRequest,
  Allocation,
  DashboardStats,
  MatchCandidate,
  MatchGraphData,
  PaginatedResponse,
  UserSession,
  UserRole,
} from '../types';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Configurable live API URL and mode flag
const LIVE_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';
const USE_MOCK_STORAGE_KEY = 'organ_network_use_mock_api';

export function isMockApiEnabled(): boolean {
  const val = localStorage.getItem(USE_MOCK_STORAGE_KEY);
  return val === null ? true : val === 'true'; // Defaults to true for out-of-the-box working demo
}

export function setMockApiEnabled(enabled: boolean): void {
  localStorage.setItem(USE_MOCK_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event('api-mode-changed'));
}

// Token storage helpers
const TOKEN_KEY = 'organ_network_access_token';
const SESSION_KEY = 'organ_network_user_session';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredSession(): UserSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function storeSession(session: UserSession): void {
  localStorage.setItem(TOKEN_KEY, session.access_token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
}

// Simulated network latency for realism
function delay(ms = 220): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Universal API Request Handler
 */
async function request<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const token = getStoredToken();
  const useMock = isMockApiEnabled();

  // If live mode is selected, forward to FastAPI backend
  if (!useMock) {
    let url = `${LIVE_BASE_URL}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') searchParams.append(k, String(v));
      });
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        let errData: any = {};
        try {
          errData = await response.json();
        } catch {
          errData = { error: { message: response.statusText } };
        }

        const code = errData?.error?.code || `HTTP_${response.status}`;
        const message = errData?.error?.message || response.statusText || 'An API error occurred';
        throw new ApiError(response.status, code, message, errData?.error?.details);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(500, 'NETWORK_ERROR', err?.message || 'Failed to connect to FastAPI server at ' + LIVE_BASE_URL);
    }
  }

  // --- MOCK API ENGINE (Matches exact FastAPI Schema) ---
  await delay(180);
  const db = loadDatabase();

  // 1. Auth: POST /auth/login
  if (endpoint === '/auth/login' && method === 'POST') {
    const { username, password } = body || {};
    if (!username || !password) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Username and password are required');
    }

    // Role mapping based on username or selection
    const lowerUser = username.toLowerCase();
    let role: UserRole = 'COORDINATOR';
    let hospital_id = 'H-001';
    let hospital_name = 'Massachusetts General Hospital';

    if (lowerUser.includes('admin')) {
      role = 'ADMIN';
      hospital_id = 'H-001';
      hospital_name = 'Regional Organ Procurement Network HQ';
    } else if (lowerUser.includes('doc') || lowerUser.includes('surgeon')) {
      role = 'DOCTOR';
      hospital_id = 'H-002';
      hospital_name = 'Johns Hopkins Hospital';
    } else if (lowerUser.includes('audit')) {
      role = 'AUDITOR';
      hospital_id = 'H-003';
      hospital_name = 'National Organ Oversight Commission';
    } else {
      role = 'COORDINATOR';
      hospital_id = 'H-001';
      hospital_name = 'Massachusetts General Hospital';
    }

    const session: UserSession = {
      access_token: `mock-jwt-token-${Date.now()}-${role}`,
      role,
      hospital_id,
      hospital_name,
      username,
      expires_in: 3600,
    };
    storeSession(session);
    return session as unknown as T;
  }

  // Auth gate check
  if (!token && endpoint !== '/auth/login') {
    // In mock mode allow seamless dev if needed, or enforce token
  }

  // 2. Stats: GET /stats/dashboard
  if (endpoint === '/stats/dashboard' && method === 'GET') {
    const totalDonors = db.donors.length;
    const availableDonors = db.donors.filter((d) => d.status === 'AVAILABLE').length;
    const waitingRecipients = db.recipients.filter((r) => r.status === 'WAITING').length;
    const confirmedAllocations = db.allocations.length;

    // Check donors expiring within 12 hours
    const now = Date.now();
    const expiryWindow = 12 * 60 * 60 * 1000;
    const donorsApproachingExpiry = db.donors.filter(
      (d) => d.status === 'AVAILABLE' && new Date(d.expires_at).getTime() - now < expiryWindow
    ).length;

    const statusBreakdown = {
      available: db.donors.filter((d) => d.status === 'AVAILABLE').length,
      matched: db.donors.filter((d) => d.status === 'MATCHED').length,
      allocated: db.donors.filter((d) => d.status === 'ALLOCATED').length,
      expired: db.donors.filter((d) => d.status === 'EXPIRED').length,
    };

    const organBreakdown: Record<string, number> = {};
    db.donors.forEach((d) => {
      organBreakdown[d.organ_type] = (organBreakdown[d.organ_type] || 0) + 1;
    });

    const bloodTypeDist: Record<string, number> = {};
    db.donors.forEach((d) => {
      bloodTypeDist[d.blood_type] = (bloodTypeDist[d.blood_type] || 0) + 1;
    });

    const stats: DashboardStats = {
      total_donors: totalDonors,
      available_donors: availableDonors,
      total_recipients_waiting: waitingRecipients,
      confirmed_allocations: confirmedAllocations,
      donors_approaching_expiry: donorsApproachingExpiry,
      status_breakdown: statusBreakdown,
      organ_breakdown: organBreakdown,
      blood_type_distribution: bloodTypeDist,
      recent_allocations: db.allocations.slice(0, 5),
      urgent_recipients: db.recipients.filter((r) => r.status === 'WAITING' && r.urgency_score >= 80).slice(0, 5),
    };
    return stats as unknown as T;
  }

  // 3. Donors: GET, POST, PATCH, DELETE
  if (endpoint.startsWith('/donors')) {
    const idMatch = endpoint.match(/\/donors\/([^/]+)/);
    const donorId = idMatch ? idMatch[1] : null;

    if (donorId && endpoint.endsWith('/candidates') && method === 'GET') {
      // Reverse candidates: Find recipients for a donor
      const donor = db.donors.find((d) => d.id === donorId);
      if (!donor) throw new ApiError(404, 'DONOR_NOT_FOUND', `Donor ${donorId} does not exist`);
      // Find waiting recipients matching donor
      const results: any[] = [];
      db.recipients
        .filter((r) => r.status === 'WAITING' && r.organ_needed === donor.organ_type)
        .forEach((r) => {
          results.push({
            recipient_id: r.id,
            recipient_name: r.name,
            blood_type: r.blood_type,
            urgency_score: r.urgency_score,
            hospital_name: r.hospital_name,
            distance_km: 150,
            match_score: 85 + Math.floor(Math.random() * 14),
          });
        });
      return { items: results, total: results.length, page: 1, page_size: 20 } as unknown as T;
    }

    if (donorId && method === 'PATCH') {
      const index = db.donors.findIndex((d) => d.id === donorId);
      if (index === -1) throw new ApiError(404, 'DONOR_NOT_FOUND', `Donor ${donorId} does not exist`);
      db.donors[index] = { ...db.donors[index], ...body };
      saveDatabase(db);
      return db.donors[index] as unknown as T;
    }

    if (donorId && method === 'DELETE') {
      const index = db.donors.findIndex((d) => d.id === donorId);
      if (index === -1) throw new ApiError(404, 'DONOR_NOT_FOUND', `Donor ${donorId} does not exist`);
      db.donors.splice(index, 1);
      saveDatabase(db);
      return { success: true, message: `Donor ${donorId} deleted` } as unknown as T;
    }

    if (method === 'POST') {
      const newId = `D-${Math.floor(100 + Math.random() * 900)}`;
      const donor: Donor = {
        id: newId,
        ...body,
        status: body.status || 'AVAILABLE',
        registration_date: new Date().toISOString(),
      };
      db.donors.unshift(donor);
      saveDatabase(db);
      return donor as unknown as T;
    }

    if (method === 'GET') {
      let filtered = [...db.donors];
      if (params?.blood_type) filtered = filtered.filter((d) => d.blood_type === params.blood_type);
      if (params?.organ_type) filtered = filtered.filter((d) => d.organ_type === params.organ_type);
      if (params?.status) filtered = filtered.filter((d) => d.status === params.status);
      if (params?.search) {
        const q = String(params.search).toLowerCase();
        filtered = filtered.filter(
          (d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.location.toLowerCase().includes(q)
        );
      }
      const page = Number(params?.page) || 1;
      const pageSize = Number(params?.page_size) || 20;
      const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
      const res: PaginatedResponse<Donor> = {
        items: paginated,
        total: filtered.length,
        page,
        page_size: pageSize,
      };
      return res as unknown as T;
    }
  }

  // 4. Recipients: GET, POST, PATCH, DELETE, and /urgency
  if (endpoint.startsWith('/recipients')) {
    const idMatch = endpoint.match(/\/recipients\/([^/]+)/);
    const recipientId = idMatch ? idMatch[1] : null;

    if (recipientId && endpoint.endsWith('/candidates') && method === 'GET') {
      const recipient = db.recipients.find((r) => r.id === recipientId);
      if (!recipient) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', `Recipient ${recipientId} not found`);
      const candidates = computeCandidatesForRecipient(recipient, db.donors);
      return { items: candidates, total: candidates.length, page: 1, page_size: 20 } as unknown as T;
    }

    if (recipientId && endpoint.endsWith('/urgency') && method === 'PATCH') {
      const index = db.recipients.findIndex((r) => r.id === recipientId);
      if (index === -1) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', `Recipient ${recipientId} not found`);
      const newScore = Number(body.urgency_score);
      if (isNaN(newScore) || newScore < 1 || newScore > 100) {
        throw new ApiError(400, 'INVALID_URGENCY_SCORE', 'Urgency score must be between 1 and 100');
      }
      db.recipients[index].urgency_score = newScore;
      if (newScore >= 90) db.recipients[index].clinical_priority = 'CRITICAL';
      else if (newScore >= 75) db.recipients[index].clinical_priority = 'HIGH';
      else db.recipients[index].clinical_priority = 'NORMAL';
      saveDatabase(db);
      return db.recipients[index] as unknown as T;
    }

    if (recipientId && method === 'PATCH') {
      const index = db.recipients.findIndex((r) => r.id === recipientId);
      if (index === -1) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', `Recipient ${recipientId} not found`);
      db.recipients[index] = { ...db.recipients[index], ...body };
      saveDatabase(db);
      return db.recipients[index] as unknown as T;
    }

    if (recipientId && method === 'DELETE') {
      const index = db.recipients.findIndex((r) => r.id === recipientId);
      if (index === -1) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', `Recipient ${recipientId} not found`);
      db.recipients.splice(index, 1);
      saveDatabase(db);
      return { success: true, message: `Recipient ${recipientId} removed` } as unknown as T;
    }

    if (method === 'POST') {
      const newId = `R-${Math.floor(200 + Math.random() * 800)}`;
      const recipient: Recipient = {
        id: newId,
        ...body,
        waiting_list_date: new Date().toISOString(),
        status: body.status || 'WAITING',
      };
      db.recipients.unshift(recipient);
      saveDatabase(db);
      return recipient as unknown as T;
    }

    if (method === 'GET') {
      let filtered = [...db.recipients];
      if (params?.blood_type) filtered = filtered.filter((r) => r.blood_type === params.blood_type);
      if (params?.organ_needed) filtered = filtered.filter((r) => r.organ_needed === params.organ_needed);
      if (params?.hospital_id) filtered = filtered.filter((r) => r.hospital_id === params.hospital_id);
      if (params?.status) filtered = filtered.filter((r) => r.status === params.status);
      if (params?.search) {
        const q = String(params.search).toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q) ||
            r.hospital_name.toLowerCase().includes(q)
        );
      }
      const page = Number(params?.page) || 1;
      const pageSize = Number(params?.page_size) || 20;
      const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
      const res: PaginatedResponse<Recipient> = {
        items: paginated,
        total: filtered.length,
        page,
        page_size: pageSize,
      };
      return res as unknown as T;
    }
  }

  // 5. Hospitals: GET, POST, PATCH, DELETE
  if (endpoint.startsWith('/hospitals')) {
    const idMatch = endpoint.match(/\/hospitals\/([^/]+)/);
    const hospitalId = idMatch ? idMatch[1] : null;

    if (hospitalId && method === 'PATCH') {
      const index = db.hospitals.findIndex((h) => h.id === hospitalId);
      if (index === -1) throw new ApiError(404, 'HOSPITAL_NOT_FOUND', `Hospital ${hospitalId} not found`);
      db.hospitals[index] = { ...db.hospitals[index], ...body };
      saveDatabase(db);
      return db.hospitals[index] as unknown as T;
    }

    if (hospitalId && method === 'DELETE') {
      const index = db.hospitals.findIndex((h) => h.id === hospitalId);
      if (index === -1) throw new ApiError(404, 'HOSPITAL_NOT_FOUND', `Hospital ${hospitalId} not found`);
      db.hospitals.splice(index, 1);
      saveDatabase(db);
      return { success: true, message: `Hospital ${hospitalId} deleted` } as unknown as T;
    }

    if (method === 'POST') {
      const newId = `H-00${db.hospitals.length + 1}`;
      const hospital: Hospital = {
        id: newId,
        ...body,
        active_transplants: 0,
      };
      db.hospitals.push(hospital);
      saveDatabase(db);
      return hospital as unknown as T;
    }

    if (method === 'GET') {
      const page = Number(params?.page) || 1;
      const pageSize = Number(params?.page_size) || 50;
      return {
        items: db.hospitals,
        total: db.hospitals.length,
        page,
        page_size: pageSize,
      } as unknown as T;
    }
  }

  // 6. Match Requests: POST, GET, confirm, reject
  if (endpoint.startsWith('/match-requests')) {
    const idMatch = endpoint.match(/\/match-requests\/([^/]+)/);
    const matchId = idMatch ? idMatch[1] : null;

    if (matchId && endpoint.endsWith('/confirm') && method === 'POST') {
      const request = db.matchRequests.find((m) => m.id === matchId);
      if (!request) throw new ApiError(404, 'REQUEST_NOT_FOUND', `Match request ${matchId} not found`);

      // Check if donor is still available - handle 409 conflict
      const donor = db.donors.find((d) => d.id === request.donor_id);
      if (!donor || donor.status === 'ALLOCATED') {
        throw new ApiError(
          409,
          'MATCH_ALREADY_ALLOCATED',
          'Donor is no longer available. Another hospital has confirmed allocation for this donor.',
          { donor_id: request.donor_id, current_status: donor?.status || 'UNKNOWN' }
        );
      }

      // Mark request CONFIRMED
      request.status = 'CONFIRMED';
      donor.status = 'ALLOCATED';

      // Update recipient status
      const recipient = db.recipients.find((r) => r.id === request.recipient_id);
      if (recipient) recipient.status = 'MATCHED';

      // Create new Allocation entry
      const newAllocation: Allocation = {
        id: `AL-${Math.floor(400 + Math.random() * 599)}`,
        match_request_id: request.id,
        donor_id: donor.id,
        donor_name: donor.name,
        recipient_id: request.recipient_id,
        recipient_name: request.recipient_name,
        confirming_hospital_id: request.requesting_hospital_id,
        confirming_hospital_name: request.requesting_hospital_name,
        organ_type: donor.organ_type,
        blood_type: donor.blood_type,
        confirmation_date: new Date().toISOString(),
        transplant_status: 'SCHEDULED',
      };
      db.allocations.unshift(newAllocation);
      saveDatabase(db);
      return { request, allocation: newAllocation } as unknown as T;
    }

    if (matchId && endpoint.endsWith('/reject') && method === 'POST') {
      const request = db.matchRequests.find((m) => m.id === matchId);
      if (!request) throw new ApiError(404, 'REQUEST_NOT_FOUND', `Match request ${matchId} not found`);
      request.status = 'REJECTED';
      if (body?.reason) request.notes = `${request.notes ? request.notes + ' ' : ''}[Rejected: ${body.reason}]`;
      saveDatabase(db);
      return request as unknown as T;
    }

    if (matchId && method === 'GET') {
      const request = db.matchRequests.find((m) => m.id === matchId);
      if (!request) throw new ApiError(404, 'REQUEST_NOT_FOUND', `Match request ${matchId} not found`);
      return request as unknown as T;
    }

    if (method === 'POST') {
      const { recipient_id, donor_id, notes } = body || {};
      const recipient = db.recipients.find((r) => r.id === recipient_id);
      const donor = db.donors.find((d) => d.id === donor_id);

      if (!recipient) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found');
      if (!donor) throw new ApiError(404, 'DONOR_NOT_FOUND', 'Donor not found');

      if (donor.status === 'ALLOCATED') {
        throw new ApiError(409, 'DONOR_ALLOCATED', 'Cannot create match request: Donor already allocated');
      }

      const matchScore = body.match_score || 92.5;
      const newMatch: MatchRequest = {
        id: `MR-${Math.floor(900 + Math.random() * 99)}`,
        donor_id: donor.id,
        donor_name: donor.name,
        donor_blood_type: donor.blood_type,
        donor_organ: donor.organ_type,
        recipient_id: recipient.id,
        recipient_name: recipient.name,
        recipient_hospital: recipient.hospital_name,
        requesting_hospital_id: recipient.hospital_id,
        requesting_hospital_name: recipient.hospital_name,
        match_score: matchScore,
        request_date: new Date().toISOString(),
        status: 'PENDING',
        urgency_at_request: recipient.urgency_score,
        notes: notes || 'Match candidate approved by transplant coordinator',
      };

      // Set donor to MATCHED
      donor.status = 'MATCHED';
      db.matchRequests.unshift(newMatch);
      saveDatabase(db);
      return newMatch as unknown as T;
    }

    if (method === 'GET') {
      let items = [...db.matchRequests];
      if (params?.status) items = items.filter((m) => m.status === params.status);
      const page = Number(params?.page) || 1;
      const pageSize = Number(params?.page_size) || 20;
      return {
        items: items.slice((page - 1) * pageSize, page * pageSize),
        total: items.length,
        page,
        page_size: pageSize,
      } as unknown as T;
    }
  }

  // 7. Allocations: GET /allocations
  if (endpoint.startsWith('/allocations') && method === 'GET') {
    const page = Number(params?.page) || 1;
    const pageSize = Number(params?.page_size) || 20;
    return {
      items: db.allocations.slice((page - 1) * pageSize, page * pageSize),
      total: db.allocations.length,
      page,
      page_size: pageSize,
    } as unknown as T;
  }

  // 8. Graph: GET /graph/match/{match_id}
  if (endpoint.startsWith('/graph/match/')) {
    const matchId = endpoint.replace('/graph/match/', '');
    const graphData = generateGraphForMatch(matchId, db);
    return graphData as unknown as T;
  }

  throw new ApiError(404, 'NOT_FOUND', `Endpoint ${method} ${endpoint} not found`);
}

export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | undefined>) =>
    request<T>(endpoint, 'GET', undefined, params),
  post: <T>(endpoint: string, body?: any) => request<T>(endpoint, 'POST', body),
  patch: <T>(endpoint: string, body?: any) => request<T>(endpoint, 'PATCH', body),
  delete: <T>(endpoint: string) => request<T>(endpoint, 'DELETE'),
  resetMockData: resetDatabase,
};
