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
import {
  BackendAllocation,
  BackendCandidateList,
  BackendDonor,
  BackendHospital,
  BackendMatchGraph,
  BackendMatchRequest,
  BackendRecipient,
  BackendReverseCandidateList,
  BackendTokenResponse,
  BackendUserResponse,
  LookupProvider,
  backendAllocationToFrontend,
  backendCandidateToFrontend,
  backendDonorToFrontend,
  backendHospitalToFrontend,
  backendMatchRequestToFrontend,
  backendRecipientToFrontend,
  frontendDonorToBackendCreate,
  frontendDonorToBackendUpdate,
  frontendHospitalToBackendCreate,
  frontendHospitalToBackendUpdate,
  frontendMatchRequestToBackendCreate,
  frontendRecipientToBackendCreate,
  frontendRecipientToBackendUpdate,
  sanitizePersonName,
  uiDonorStatusToBackend,
  uiMatchRequestStatusToBackend,
  uiRecipientStatusToBackend,
} from './adapters';

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

// Configurable live API URL and mode flag.
// Resolution order (explicit, single source of truth):
//   1. VITE_API_URL (authoritative; /api/v1 suffix normalized to exactly once)
//   2.Development fallback: local FastAPI server
//   3. Production default: same-origin /api/v1 (reverse-proxy deployed)
function resolveLiveBaseUrl(): string {
  const env = (import.meta as any).env || {};
  const configured = env.VITE_API_URL;
  if (configured && String(configured).trim()) {
    const trimmed = String(configured).trim().replace(/\/+$/, '');
    // Apply the /api/v<N> prefix exactly once.
    return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
  }
  if (env.DEV) {
    return 'http://127.0.0.1:8000/api/v1';
  }
  return '/api/v1';
}

export const LIVE_BASE_URL = resolveLiveBaseUrl();

const USE_MOCK_STORAGE_KEY = 'organ_network_use_mock_api';

function getDefaultMockMode(): boolean {
  const envValue = (import.meta as any).env?.VITE_USE_MOCK_API;
  if (envValue === undefined) {
    return false;
  }
  return envValue === 'true';
}

export function isMockApiEnabled(): boolean {
  const val = localStorage.getItem(USE_MOCK_STORAGE_KEY);
  return val === null ? getDefaultMockMode() : val === 'true';
}

export function setMockApiEnabled(enabled: boolean): void {
  localStorage.setItem(USE_MOCK_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event('api-mode-changed'));
}

// Token storage helpers
const TOKEN_KEY = 'organ_network_access_token';
const SESSION_KEY = 'organ_network_user_session';

/** Fired when the live backend rejects the stored bearer token with HTTP 401. */
export const SESSION_EXPIRED_EVENT = 'organ_network_session_expired';

export function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  return token;
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
  if (!session?.access_token) {
    throw new Error('Cannot persist a session without an access token.');
  }
  localStorage.setItem(TOKEN_KEY, session.access_token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
}

// Simulated network latency for realism (mock engine only)
function delay(ms = 220): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// LIVE API LAYER
// ---------------------------------------------------------------------------

/** Raw authenticated live fetch without view-model adaptation. */
async function rawLiveRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  let url = `${LIVE_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') searchParams.append(k, String(v));
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err: any) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      err?.message || `Failed to connect to the FastAPI server at ${LIVE_BASE_URL}`
    );
  }

  if (!response.ok) {
    let errData: any = {};
    let parseFailed = false;
    try {
      errData = await response.json();
    } catch {
      parseFailed = true;
    }
    const code = errData?.error?.code || (parseFailed ? `HTTP_${response.status}` : `HTTP_${response.status}`);
    const message =
      errData?.error?.message ||
      response.statusText ||
      'An API error occurred.';
    throw new ApiError(response.status, code, message, errData?.error?.details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      502,
      'MALFORMED_RESPONSE',
      'The backend returned a malformed (non-JSON) response body.'
    );
  }
}

/** Translates a live 401 into a controlled session-expiry signal. */
function handleLiveAuthRejection(endpoint: string, err: ApiError): void {
  if (err.status === 401 && !endpoint.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

// Name/identifier lookups for enrichment (real list endpoints only, cached once)
const lookups = new LookupProvider({
  rawGet: <U,>(
    endpoint: string,
    params?: Record<string, string | number | undefined>
  ): Promise<U> => rawLiveRequest<U>(endpoint, 'GET', undefined, params),
});

function paginatedEnvelope<T>(items: T[], total: number, page: number, page_size: number): PaginatedResponse<T> {
  return { items, total, page, page_size };
}

/**
 * Live request dispatcher.
 * Translates the canonical frontend endpoint into the verified backend route,
 * maps payloads into backend schemas, and maps backend responses into the
 * frontend view model. Mock mode never reaches this code path.
 */
async function liveRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: any,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  try {
    // ---------------------------- Auth ----------------------------
    if (endpoint === '/auth/login' && method === 'POST') {
      // Backend accepts JSON {username, password} -> TokenResponse.
      return (await rawLiveRequest<BackendTokenResponse>('/auth/login', method, body)) as unknown as T;
    }

    if (endpoint === '/auth/me' && method === 'GET') {
      return (await rawLiveRequest<BackendUserResponse>('/auth/me', 'GET')) as unknown as T;
    }

    // ---------------------------- Donors ----------------------------
    if (endpoint === '/donors' && method === 'GET') {
      const res = await rawLiveRequest<{ items: BackendDonor[]; total: number; page: number; page_size: number }>(
        '/donors',
        'GET',
        undefined,
        {
          status: params?.status ? uiDonorStatusToBackend(String(params.status)) : undefined,
          organ_type: params?.organ_type ? String(params.organ_type) : undefined,
          blood_type: params?.blood_type ? String(params.blood_type) : undefined,
          page: params?.page,
          page_size: params?.page_size,
        }
      );
      let items = res.items.map((d) => backendDonorToFrontend(d));
      // Backend has no server-side name search; filter within the retrieved page.
      if (params?.search) {
        const q = String(params.search).toLowerCase();
        items = items.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.id.toLowerCase().includes(q) ||
            d.location.toLowerCase().includes(q)
        );
      }
      return paginatedEnvelope(items, res.total, res.page, res.page_size) as unknown as T;
    }

    if (endpoint === '/donors' && method === 'POST') {
      const payload = frontendDonorToBackendCreate(body, false);
      const created = await rawLiveRequest<BackendDonor>('/donors', 'POST', payload);
      return backendDonorToFrontend(created) as unknown as T;
    }

    const donorIdMatch = endpoint.match(/^\/donors\/([^/]+)(\/.*)?$/);
    if (donorIdMatch && !donorIdMatch[2]) {
      const donorId = donorIdMatch[1];
      if (method === 'GET') {
        const d = await rawLiveRequest<BackendDonor>(`/donors/${encodeURIComponent(donorId)}`, 'GET');
        return backendDonorToFrontend(d) as unknown as T;
      }
      if (method === 'PATCH') {
        const payload = frontendDonorToBackendUpdate(body, false);
        const updated = await rawLiveRequest<BackendDonor>(
          `/donors/${encodeURIComponent(donorId)}`,
          'PATCH',
          payload
        );
        return backendDonorToFrontend(updated) as unknown as T;
      }
      if (method === 'DELETE') {
        await rawLiveRequest<void>(`/donors/${encodeURIComponent(donorId)}`, 'DELETE');
        return { success: true, message: `Donor ${donorId} deleted` } as unknown as T;
      }
    }

    // Reverse discovery: WIP backend extension /matches/donors/{id}/candidate-recipients
    if (donorIdMatch && donorIdMatch[2] === '/candidates' && method === 'GET') {
      const donorId = donorIdMatch[1];
      const res = await rawLiveRequest<BackendReverseCandidateList>(
        `/matches/donors/${encodeURIComponent(donorId)}/candidate-recipients`,
        'GET',
        undefined,
        { page: params?.page, page_size: params?.page_size }
      );
      // Enrich hospital names from the hospitals list (real data).
      const items: Array<Record<string, unknown>> = [];
      for (const item of res.items) {
        const hospitalName = await lookups.hospitalName(item.hospital_id as string);
        items.push({
          recipient_id: item.recipient_id,
          recipient_name: sanitizePersonName(item.name),
          blood_type: item.blood_type,
          urgency_score: item.urgency_score,
          hospital_id: item.hospital_id,
          hospital_name: hospitalName,
          distance_km: item.distance_km,
          match_score: item.score,
        });
      }
      return paginatedEnvelope(items, res.total, res.page, res.page_size) as unknown as T;
    }

    // ---------------------------- Recipients ----------------------------
    if (endpoint === '/recipients' && method === 'GET') {
      const res = await rawLiveRequest<{ items: BackendRecipient[]; total: number; page: number; page_size: number }>(
        '/recipients',
        'GET',
        undefined,
        {
          organ_needed: params?.organ_needed ? String(params.organ_needed) : undefined,
          blood_type: params?.blood_type ? String(params.blood_type) : undefined,
          hospital_id: params?.hospital_id ? String(params.hospital_id) : undefined,
          status: params?.status ? uiRecipientStatusToBackend(String(params.status)) : undefined,
          page: params?.page,
          page_size: params?.page_size,
        }
      );
      // Enrich hospital names (hospitals list is small; one cached call).
      const items: Recipient[] = [];
      for (const r of res.items) {
        const hospitalName = await lookups.hospitalName(r.hospital_id);
        items.push(backendRecipientToFrontend(r, hospitalName));
      }
      if (params?.search) {
        const q = String(params.search).toLowerCase();
        const filtered = items.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q) ||
            (r.hospital_name || '').toLowerCase().includes(q)
        );
        // Keep the server-defined total; search narrows only the visible page.
        return { items: filtered, total: res.total, page: res.page, page_size: res.page_size } as unknown as T;
      }
      return paginatedEnvelope(items, res.total, res.page, res.page_size) as unknown as T;
    }

    if (endpoint === '/recipients' && method === 'POST') {
      const payload = frontendRecipientToBackendCreate(body, false);
      const created = await rawLiveRequest<BackendRecipient>('/recipients', 'POST', payload);
      const hospitalName = await lookups.hospitalName(created.hospital_id);
      return backendRecipientToFrontend(created, hospitalName) as unknown as T;
    }

    const recipientIdMatch = endpoint.match(/^\/recipients\/([^/]+)(\/.*)?$/);
    if (recipientIdMatch && recipientIdMatch[2] === '/urgency' && method === 'PATCH') {
      const recipientId = recipientIdMatch[1];
      // The live backend expects urgency_score as an integer 1-10.
      const updated = await rawLiveRequest<BackendRecipient>(
        `/recipients/${encodeURIComponent(recipientId)}/urgency`,
        'PATCH',
        { urgency_score: body?.urgency_score }
      );
      const hospitalName = await lookups.hospitalName(updated.hospital_id);
      return backendRecipientToFrontend(updated, hospitalName) as unknown as T;
    }

    if (recipientIdMatch && recipientIdMatch[2] === '/candidates' && method === 'GET') {
      // Backend route: GET /matches/recipients/{id}/candidates
      const recipientId = recipientIdMatch[1];
      const res = await rawLiveRequest<BackendCandidateList>(
        `/matches/recipients/${encodeURIComponent(recipientId)}/candidates`,
        'GET',
        undefined,
        { page: params?.page, page_size: params?.page_size }
      );
      const candidates = res.items.map((c) => backendCandidateToFrontend(c));
      return paginatedEnvelope(candidates, res.total, res.page, res.page_size) as unknown as T;
    }

    if (recipientIdMatch && !recipientIdMatch[2]) {
      const recipientId = recipientIdMatch[1];
      if (method === 'GET') {
        const r = await rawLiveRequest<BackendRecipient>(
          `/recipients/${encodeURIComponent(recipientId)}`,
          'GET'
        );
        const hospitalName = await lookups.hospitalName(r.hospital_id);
        return backendRecipientToFrontend(r, hospitalName) as unknown as T;
      }
      if (method === 'PATCH') {
        const payload = frontendRecipientToBackendUpdate(body, false);
        const updated = await rawLiveRequest<BackendRecipient>(
          `/recipients/${encodeURIComponent(recipientId)}`,
          'PATCH',
          payload
        );
        const hospitalName = await lookups.hospitalName(updated.hospital_id);
        return backendRecipientToFrontend(updated, hospitalName) as unknown as T;
      }
      if (method === 'DELETE') {
        await rawLiveRequest<void>(`/recipients/${encodeURIComponent(recipientId)}`, 'DELETE');
        return { success: true, message: `Recipient ${recipientId} removed` } as unknown as T;
      }
    }

    // ---------------------------- Hospitals ----------------------------
    if (endpoint === '/hospitals' && method === 'GET') {
      const res = await rawLiveRequest<{ items: BackendHospital[]; total: number; page: number; page_size: number }>(
        '/hospitals',
        'GET',
        undefined,
        { name: params?.search ? String(params.search) : undefined, page: params?.page, page_size: params?.page_size }
      );
      return paginatedEnvelope(
        res.items.map((h) => backendHospitalToFrontend(h)),
        res.total,
        res.page,
        res.page_size
      ) as unknown as T;
    }

    if (endpoint === '/hospitals' && method === 'POST') {
      const payload = frontendHospitalToBackendCreate(body, false);
      const created = await rawLiveRequest<BackendHospital>('/hospitals', 'POST', payload);
      return backendHospitalToFrontend(created) as unknown as T;
    }

    const hospitalIdMatch = endpoint.match(/^\/hospitals\/([^/]+)$/);
    if (hospitalIdMatch) {
      const hospitalId = hospitalIdMatch[1];
      if (method === 'GET') {
        const h = await rawLiveRequest<BackendHospital>(
          `/hospitals/${encodeURIComponent(hospitalId)}`,
          'GET'
        );
        return backendHospitalToFrontend(h) as unknown as T;
      }
      if (method === 'PATCH') {
        const payload = frontendHospitalToBackendUpdate(body, false);
        const updated = await rawLiveRequest<BackendHospital>(
          `/hospitals/${encodeURIComponent(hospitalId)}`,
          'PATCH',
          payload
        );
        return backendHospitalToFrontend(updated) as unknown as T;
      }
      if (method === 'DELETE') {
        await rawLiveRequest<void>(`/hospitals/${encodeURIComponent(hospitalId)}`, 'DELETE');
        return { success: true, message: `Hospital ${hospitalId} deleted` } as unknown as T;
      }
    }

    // ---------------------------- Match requests ----------------------------
    if (endpoint === '/match-requests' && method === 'POST') {
      const payload = frontendMatchRequestToBackendCreate(body, false);
      const created = await rawLiveRequest<BackendMatchRequest>('/matches/requests', 'POST', payload);
      // Enrichment from real endpoints (donor names / hospital names).
      const donor = await lookups.donorById(created.donor_id);
      const hospitalName = await lookups.hospitalName(created.hospital_id);
      const mapped = backendMatchRequestToFrontend(created, donor, hospitalName);
      const recipient = await lookups.recipientById(created.recipient_id);
      if (recipient) {
        mapped.recipient_name = recipient.name;
      }
      return mapped as unknown as T;
    }

    if (endpoint === '/match-requests' && method === 'GET') {
      const res = await rawLiveRequest<{ items: BackendMatchRequest[]; total: number; page: number; page_size: number }>(
        '/matches/requests',
        'GET',
        undefined,
        {
          status: params?.status ? uiMatchRequestStatusToBackend(String(params.status)) : undefined,
          recipient_id: params?.recipient_id ? String(params.recipient_id) : undefined,
          page: params?.page,
          page_size: params?.page_size,
        }
      );
      const items: MatchRequest[] = [];
      for (const m of res.items) {
        const donor = await lookups.donorById(m.donor_id);
        const hospitalName = await lookups.hospitalName(m.hospital_id);
        const mapped = backendMatchRequestToFrontend(m, donor, hospitalName);
        const recipient = await lookups.recipientById(m.recipient_id);
        if (recipient) {
          mapped.recipient_name = recipient.name;
        }
        items.push(mapped);
      }
      return paginatedEnvelope(items, res.total, res.page, res.page_size) as unknown as T;
    }

    const requestIdMatch = endpoint.match(/^\/match-requests\/([^/]+)(\/.*)?$/);
    if (requestIdMatch) {
      const matchId = requestIdMatch[1];
      const action = requestIdMatch[2];
      if (!action && method === 'GET') {
        const m = await rawLiveRequest<BackendMatchRequest>(
          `/matches/requests/${encodeURIComponent(matchId)}`,
          'GET'
        );
        const donor = await lookups.donorById(m.donor_id);
        const hospitalName = await lookups.hospitalName(m.hospital_id);
        const mapped = backendMatchRequestToFrontend(m, donor, hospitalName);
        const recipient = await lookups.recipientById(m.recipient_id);
        if (recipient) {
          mapped.recipient_name = recipient.name;
        }
        return mapped as unknown as T;
      }
      if (action === '/confirm' && method === 'POST') {
        // The real backend workflow: POST /matches/requests/{id}/allocate
        const allocation = await rawLiveRequest<BackendAllocation>(
          `/matches/requests/${encodeURIComponent(matchId)}/allocate`,
          'POST',
          {}
        );
        const donor = await lookups.donorById(allocation.donor_id);
        const hospitalName = await lookups.hospitalName(allocation.hospital_id);
        const recipient = await lookups.recipientById(allocation.recipient_id);
        return backendAllocationToFrontend(allocation, donor, recipient?.name, hospitalName) as unknown as T;
      }
      if (action === '/reject' && method === 'POST') {
        // Backend extension: PATCH /matches/requests/{id}/reject
        const updated = await rawLiveRequest<BackendMatchRequest>(
          `/matches/requests/${encodeURIComponent(matchId)}/reject`,
          'PATCH',
          { reason: body?.reason }
        );
        const donor = await lookups.donorById(updated.donor_id);
        const hospitalName = await lookups.hospitalName(updated.hospital_id);
        const mapped = backendMatchRequestToFrontend(updated, donor, hospitalName);
        const recipient = await lookups.recipientById(updated.recipient_id);
        if (recipient) {
          mapped.recipient_name = recipient.name;
        }
        return mapped as unknown as T;
      }
    }

    // ---------------------------- Allocations ----------------------------
    if (endpoint === '/allocations' && method === 'GET') {
      const res = await rawLiveRequest<{ items: BackendAllocation[]; total: number; page: number; page_size: number }>(
        '/allocations',
        'GET',
        undefined,
        {
          donor_id: params?.donor_id ? String(params.donor_id) : undefined,
          recipient_id: params?.recipient_id ? String(params.recipient_id) : undefined,
          page: params?.page,
          page_size: params?.page_size,
        }
      );
      const items: Allocation[] = [];
      for (const a of res.items) {
        const donor = await lookups.donorById(a.donor_id);
        const hospitalName = await lookups.hospitalName(a.hospital_id);
        const recipient = await lookups.recipientById(a.recipient_id);
        items.push(backendAllocationToFrontend(a, donor, recipient?.name, hospitalName));
      }
      return paginatedEnvelope(items, res.total, res.page, res.page_size) as unknown as T;
    }

    // ---------------------------- Dashboard stats ----------------------------
    if (endpoint === '/stats/dashboard' && method === 'GET') {
      const raw = await rawLiveRequest<Record<string, any>>('/stats/dashboard', 'GET');
      const sb = raw.status_breakdown || {};
      const items = (raw.urgent_recipients || []) as BackendRecipient[];
      const recipients: Recipient[] = [];
      for (const r of items) {
        const hospitalName = await lookups.hospitalName(r.hospital_id);
        recipients.push(backendRecipientToFrontend(r, hospitalName));
      }
      const allocationsRaw = (raw.recent_allocations || []) as BackendAllocation[];
      const allocations: Allocation[] = [];
      for (const a of allocationsRaw) {
        const donor = await lookups.donorById(a.donor_id);
        const hospitalName = await lookups.hospitalName(a.hospital_id);
        const recipient = await lookups.recipientById(a.recipient_id);
        allocations.push(backendAllocationToFrontend(a, donor, recipient?.name, hospitalName));
      }
      const stats: DashboardStats = {
        total_donors: raw.total_donors,
        available_donors: raw.available_donors,
        total_recipients_waiting: raw.total_recipients_waiting,
        confirmed_allocations: raw.confirmed_allocations,
        donors_approaching_expiry: raw.donors_approaching_expiry,
        status_breakdown: {
          available: sb['Available'] ?? 0,
          reserved: sb['Reserved'] ?? 0,
          matched: undefined, // live backend has no MATCHED donor status
          allocated: sb['Allocated'] ?? 0,
          expired: sb['Expired'] ?? 0,
        },
        organ_breakdown: raw.organ_breakdown || {},
        blood_type_distribution: raw.blood_type_distribution || {},
        recent_allocations: allocations,
        urgent_recipients: recipients,
      };
      return stats as unknown as T;
    }

    // ---------------------------- Graph visualization ----------------------------
    if (endpoint.startsWith('/graph/match/') && method === 'GET') {
      const matchId = endpoint.replace('/graph/match/', '');
      const graph = await rawLiveRequest<BackendMatchGraph>(
        `/graph/matches/${encodeURIComponent(matchId)}`,
        'GET'
      );
      // Node labels for Donor/Recipient nodes are person names; strip legacy
      // synthetic prefixes so the canvas/detail panel shows the actual name.
      graph.nodes = graph.nodes.map((n) =>
        n.type === 'DONOR' || n.type === 'RECIPIENT'
          ? { ...n, label: sanitizePersonName(String(n.label)) }
          : n
      );
      // Normalize node types to match frontend canvas expectations.
      // The live backend may return types with varying casing or whitespace;
      // ensure they map to the canonical frontend type constants.
      const typeMap: Record<string, string> = {
        DONOR: 'DONOR',
        RECIPIENT: 'RECIPIENT',
        HOSPITAL: 'HOSPITAL',
        MATCH_REQUEST: 'MATCH_REQUEST',
        ALLOCATION: 'ALLOCATION',
      };
      graph.nodes = graph.nodes.map((n) => ({
        ...n,
        type: typeMap[n.type.toUpperCase().trim()] || n.type,
      }));
      return graph as unknown as T;
    }

    throw new ApiError(404, 'NOT_FOUND', `No live backend handler for ${method} ${endpoint}`);
  } catch (err: any) {
    if (err instanceof ApiError) {
      handleLiveAuthRejection(endpoint, err);
      throw err;
    }
    const wrapped = new ApiError(
      err?.status ?? 500,
      err?.code ?? 'CLIENT_MAPPING_ERROR',
      err?.message || 'Failed to prepare or process the live API request.'
    );
    handleLiveAuthRejection(endpoint, wrapped);
    throw wrapped;
  }
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
  const useMock = isMockApiEnabled();

  // Live mode: forward to FastAPI backend (never falls back to mock data).
  if (!useMock) {
    return liveRequest<T>(endpoint, method, body, params);
  }

  // --- MOCK API ENGINE (Matches the frontend view model; isolated from the live contract) ---
  await delay(180);
  const db = loadDatabase();
  const token = getStoredToken();

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
    // Mock mode preserves its original permissive demo behavior: no token gate.
    // (Do NOT change this silently; mock data remains isolated from live RBAC.)
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
          (d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || (d.location || '').toLowerCase().includes(q)
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
