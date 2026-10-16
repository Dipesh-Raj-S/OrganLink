import {
  Donor,
  Recipient,
  Hospital,
  MatchRequest,
  Allocation,
  DashboardStats,
  MatchCandidate,
  MatchGraphData,
  GraphNode,
  GraphEdge,
  BloodType,
  OrganType,
} from '../types';

// Standard ABO Blood Compatibility Matrix
export const ABO_COMPATIBILITY: Record<BloodType, BloodType[]> = {
  // Recipient -> Can receive from these donor blood types
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], // Universal recipient
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'], // Universal donor only receives O-
};

export const INITIAL_HOSPITALS: Hospital[] = [
  {
    id: 'H-001',
    name: 'Massachusetts General Hospital',
    location: 'Boston, MA',
    tier: 'Level 1 Trauma & Transplant Center',
    contact_number: '+1 (617) 726-2000',
    active_transplants: 18,
    coordinator_name: 'Dr. Sarah Jenkins',
  },
  {
    id: 'H-002',
    name: 'Johns Hopkins Hospital',
    location: 'Baltimore, MD',
    tier: 'Comprehensive Organ Transplant Center',
    contact_number: '+1 (410) 955-5000',
    active_transplants: 24,
    coordinator_name: 'Dr. Marcus Vance',
  },
  {
    id: 'H-003',
    name: 'Mount Sinai Medical Center',
    location: 'New York, NY',
    tier: 'Academic Medical & Transplant Hub',
    contact_number: '+1 (212) 241-6500',
    active_transplants: 15,
    coordinator_name: 'Elena Rostova, RN',
  },
  {
    id: 'H-004',
    name: 'Hospital of the University of Pennsylvania',
    location: 'Philadelphia, PA',
    tier: 'Regional Organ Procurement Institute',
    contact_number: '+1 (215) 662-4000',
    active_transplants: 21,
    coordinator_name: 'David Sterling, CPTC',
  },
  {
    id: 'H-005',
    name: 'Northwestern Memorial Hospital',
    location: 'Chicago, IL',
    tier: 'Multi-Organ Transplant Unit',
    contact_number: '+1 (312) 926-2000',
    active_transplants: 12,
    coordinator_name: 'Dr. Alistair Chen',
  },
];

// Helper to construct dynamic future dates based on current time
const now = Date.now();
const hourMs = 60 * 60 * 1000;

export const INITIAL_DONORS: Donor[] = [
  {
    id: 'D-101',
    name: 'Arthur Pendelton',
    blood_type: 'O-',
    organ_type: 'Kidney',
    location: 'Boston, MA',
    hospital_id: 'H-001',
    hospital_name: 'Massachusetts General Hospital',
    status: 'AVAILABLE',
    registration_date: new Date(now - 14 * hourMs).toISOString(),
    expires_at: new Date(now + 8 * hourMs).toISOString(), // 8 hours remaining
    age: 34,
    gender: 'M',
    hla_type: 'A2, A24, B44, DR4',
    medical_notes: 'Cold ischemic time: 3.2 hrs. Creatinine baseline 0.9 mg/dL. Normal perfusion verified.',
  },
  {
    id: 'D-102',
    name: 'Clara Oswald',
    blood_type: 'A+',
    organ_type: 'Liver',
    location: 'New York, NY',
    hospital_id: 'H-003',
    hospital_name: 'Mount Sinai Medical Center',
    status: 'AVAILABLE',
    registration_date: new Date(now - 6 * hourMs).toISOString(),
    expires_at: new Date(now + 4.5 * hourMs).toISOString(), // 4.5 hours remaining (URGENT)
    age: 28,
    gender: 'F',
    hla_type: 'A1, B8, DR3',
    medical_notes: 'Split liver candidate. Donor hemodynamically stable. Biopsy: <5% steatosis.',
  },
  {
    id: 'D-103',
    name: 'Marcus Brody',
    blood_type: 'B+',
    organ_type: 'Heart',
    location: 'Philadelphia, PA',
    hospital_id: 'H-004',
    hospital_name: 'Hospital of the University of Pennsylvania',
    status: 'AVAILABLE',
    registration_date: new Date(now - 2 * hourMs).toISOString(),
    expires_at: new Date(now + 3 * hourMs).toISOString(), // 3 hours remaining (CRITICAL)
    age: 41,
    gender: 'M',
    hla_type: 'A3, B7, DR2',
    medical_notes: 'Echocardiogram: EF 65%. Coronary angiography normal. Maximum ischemic threshold 4 hours.',
  },
  {
    id: 'D-104',
    name: 'Helena Berg',
    blood_type: 'O+',
    organ_type: 'Kidney',
    location: 'Baltimore, MD',
    hospital_id: 'H-002',
    hospital_name: 'Johns Hopkins Hospital',
    status: 'AVAILABLE',
    registration_date: new Date(now - 18 * hourMs).toISOString(),
    expires_at: new Date(now + 16 * hourMs).toISOString(),
    age: 45,
    gender: 'F',
    hla_type: 'A2, B35, DR1',
    medical_notes: 'Pulsatile machine perfusion underway. Resistive index 0.22.',
  },
  {
    id: 'D-105',
    name: 'Julian Mercer',
    blood_type: 'AB+',
    organ_type: 'Lung',
    location: 'Boston, MA',
    hospital_id: 'H-001',
    hospital_name: 'Massachusetts General Hospital',
    status: 'AVAILABLE',
    registration_date: new Date(now - 4 * hourMs).toISOString(),
    expires_at: new Date(now + 5 * hourMs).toISOString(),
    age: 39,
    gender: 'M',
    hla_type: 'A11, B51, DR7',
    medical_notes: 'Bilateral donor lungs. PaO2/FiO2 ratio 460. Bronchoscopy clear.',
  },
  {
    id: 'D-106',
    name: 'Sophia Wu',
    blood_type: 'O-',
    organ_type: 'Whole Blood',
    location: 'Chicago, IL',
    hospital_id: 'H-005',
    hospital_name: 'Northwestern Memorial Hospital',
    status: 'AVAILABLE',
    registration_date: new Date(now - 72 * hourMs).toISOString(),
    expires_at: new Date(now + 480 * hourMs).toISOString(),
    age: 26,
    gender: 'F',
    hla_type: 'N/A (Packed RBC)',
    medical_notes: 'Universal O-Negative red blood cells (450 mL unit). Screened negative for pathogens.',
  },
  {
    id: 'D-107',
    name: 'Robert Hastings',
    blood_type: 'A-',
    organ_type: 'Cornea',
    location: 'New York, NY',
    hospital_id: 'H-003',
    hospital_name: 'Mount Sinai Medical Center',
    status: 'AVAILABLE',
    registration_date: new Date(now - 20 * hourMs).toISOString(),
    expires_at: new Date(now + 180 * hourMs).toISOString(),
    age: 52,
    gender: 'M',
    hla_type: 'N/A (Avascular tissue)',
    medical_notes: 'Endothelial cell density >2600 cells/mm2. Stored in Optisol-GS at 4°C.',
  },
  {
    id: 'D-108',
    name: 'Katherine Miller',
    blood_type: 'B-',
    organ_type: 'Platelets',
    location: 'Baltimore, MD',
    hospital_id: 'H-002',
    hospital_name: 'Johns Hopkins Hospital',
    status: 'MATCHED',
    registration_date: new Date(now - 48 * hourMs).toISOString(),
    expires_at: new Date(now + 72 * hourMs).toISOString(),
    age: 31,
    gender: 'F',
    hla_type: 'Single-donor apheresis',
    medical_notes: 'Platelet count 3.8 x 10^11. Crossmatched and reserved for pending bone marrow transplant recipient.',
  },
  {
    id: 'D-109',
    name: 'Lucas Wright',
    blood_type: 'A+',
    organ_type: 'Kidney',
    location: 'Philadelphia, PA',
    hospital_id: 'H-004',
    hospital_name: 'Hospital of the University of Pennsylvania',
    status: 'ALLOCATED',
    registration_date: new Date(now - 30 * hourMs).toISOString(),
    expires_at: new Date(now - 2 * hourMs).toISOString(),
    age: 48,
    gender: 'M',
    hla_type: 'A2, B18, DR4',
    medical_notes: 'Allocated to R-204 at Mount Sinai Medical Center. Transferred under cold preservation protocol.',
  },
];

export const INITIAL_RECIPIENTS: Recipient[] = [
  {
    id: 'R-201',
    name: 'Emily Thornton',
    blood_type: 'O+',
    organ_needed: 'Kidney',
    urgency_score: 96,
    hospital_id: 'H-001',
    hospital_name: 'Massachusetts General Hospital',
    waiting_list_date: '2025-04-12T08:00:00Z',
    status: 'WAITING',
    age: 43,
    gender: 'F',
    location: 'Boston, MA',
    contact_email: 'ethornton.patient@mgh.harvard.edu',
    clinical_priority: 'CRITICAL',
  },
  {
    id: 'R-202',
    name: 'David K. Henderson',
    blood_type: 'A+',
    organ_needed: 'Liver',
    urgency_score: 94,
    hospital_id: 'H-002',
    hospital_name: 'Johns Hopkins Hospital',
    waiting_list_date: '2025-06-19T14:30:00Z',
    status: 'WAITING',
    age: 57,
    gender: 'M',
    location: 'Baltimore, MD',
    contact_email: 'dhenderson@hopkinsmedicine.org',
    clinical_priority: 'CRITICAL',
  },
  {
    id: 'R-203',
    name: 'Siddharth Rao',
    blood_type: 'B+',
    organ_needed: 'Heart',
    urgency_score: 98,
    hospital_id: 'H-003',
    hospital_name: 'Mount Sinai Medical Center',
    waiting_list_date: '2025-02-01T10:15:00Z',
    status: 'WAITING',
    age: 38,
    gender: 'M',
    location: 'New York, NY',
    contact_email: 'srao.transplant@mountsinai.org',
    clinical_priority: 'CRITICAL',
  },
  {
    id: 'R-204',
    name: 'Margaret Sullivan',
    blood_type: 'A+',
    organ_needed: 'Kidney',
    urgency_score: 82,
    hospital_id: 'H-003',
    hospital_name: 'Mount Sinai Medical Center',
    waiting_list_date: '2025-08-11T11:00:00Z',
    status: 'MATCHED',
    age: 62,
    gender: 'F',
    location: 'New York, NY',
    contact_email: 'msullivan@nyc.rr.com',
    clinical_priority: 'HIGH',
  },
  {
    id: 'R-205',
    name: 'Gabriel Morales',
    blood_type: 'AB+',
    organ_needed: 'Lung',
    urgency_score: 88,
    hospital_id: 'H-004',
    hospital_name: 'Hospital of the University of Pennsylvania',
    waiting_list_date: '2025-09-04T16:45:00Z',
    status: 'WAITING',
    age: 49,
    gender: 'M',
    location: 'Philadelphia, PA',
    contact_email: 'gmorales@pennmedicine.upenn.edu',
    clinical_priority: 'HIGH',
  },
  {
    id: 'R-206',
    name: 'Nora Lindqvist',
    blood_type: 'O-',
    organ_needed: 'Whole Blood',
    urgency_score: 75,
    hospital_id: 'H-005',
    hospital_name: 'Northwestern Memorial Hospital',
    waiting_list_date: '2026-01-15T09:20:00Z',
    status: 'WAITING',
    age: 31,
    gender: 'F',
    location: 'Chicago, IL',
    contact_email: 'nlindqvist@nm.org',
    clinical_priority: 'NORMAL',
  },
  {
    id: 'R-207',
    name: 'Franklin Pierce',
    blood_type: 'A-',
    organ_needed: 'Cornea',
    urgency_score: 64,
    hospital_id: 'H-001',
    hospital_name: 'Massachusetts General Hospital',
    waiting_list_date: '2025-11-20T13:00:00Z',
    status: 'WAITING',
    age: 69,
    gender: 'M',
    location: 'Boston, MA',
    contact_email: 'fpierce@massgeneral.org',
    clinical_priority: 'NORMAL',
  },
];

export const INITIAL_MATCH_REQUESTS: MatchRequest[] = [
  {
    id: 'MR-901',
    donor_id: 'D-102',
    donor_name: 'Clara Oswald',
    donor_blood_type: 'A+',
    donor_organ: 'Liver',
    recipient_id: 'R-202',
    recipient_name: 'David K. Henderson',
    recipient_hospital: 'Johns Hopkins Hospital',
    requesting_hospital_id: 'H-002',
    requesting_hospital_name: 'Johns Hopkins Hospital',
    match_score: 94.8,
    request_date: new Date(now - 1.5 * hourMs).toISOString(),
    status: 'PENDING',
    urgency_at_request: 94,
    notes: 'Urgent MELD score 36. Distance New York to Baltimore 305 km via medical transport flight.',
  },
  {
    id: 'MR-902',
    donor_id: 'D-108',
    donor_name: 'Katherine Miller',
    donor_blood_type: 'B-',
    donor_organ: 'Platelets',
    recipient_id: 'R-203',
    recipient_name: 'Siddharth Rao',
    recipient_hospital: 'Mount Sinai Medical Center',
    requesting_hospital_id: 'H-003',
    requesting_hospital_name: 'Mount Sinai Medical Center',
    match_score: 87.2,
    request_date: new Date(now - 5 * hourMs).toISOString(),
    status: 'CONFIRMED',
    urgency_at_request: 98,
    notes: 'Approved by clinical transplant committee.',
  },
];

export const INITIAL_ALLOCATIONS: Allocation[] = [
  {
    id: 'AL-401',
    match_request_id: 'MR-880',
    donor_id: 'D-109',
    donor_name: 'Lucas Wright',
    recipient_id: 'R-204',
    recipient_name: 'Margaret Sullivan',
    confirming_hospital_id: 'H-003',
    confirming_hospital_name: 'Mount Sinai Medical Center',
    organ_type: 'Kidney',
    blood_type: 'A+',
    confirmation_date: new Date(now - 28 * hourMs).toISOString(),
    transplant_status: 'COMPLETED',
  },
  {
    id: 'AL-402',
    match_request_id: 'MR-871',
    donor_id: 'D-098',
    donor_name: 'Hannah Abbott',
    recipient_id: 'R-192',
    recipient_name: 'George Weasley',
    confirming_hospital_id: 'H-001',
    confirming_hospital_name: 'Massachusetts General Hospital',
    organ_type: 'Heart',
    blood_type: 'O+',
    confirmation_date: new Date(now - 72 * hourMs).toISOString(),
    transplant_status: 'COMPLETED',
  },
  {
    id: 'AL-403',
    match_request_id: 'MR-860',
    donor_id: 'D-092',
    donor_name: 'Cedric Diggory',
    recipient_id: 'R-185',
    recipient_name: 'Remus Lupin',
    confirming_hospital_id: 'H-004',
    confirming_hospital_name: 'Hospital of the University of Pennsylvania',
    organ_type: 'Liver',
    blood_type: 'B+',
    confirmation_date: new Date(now - 120 * hourMs).toISOString(),
    transplant_status: 'COMPLETED',
  },
];

// Distance matrix approximation between hospital cities (in km)
const CITY_DISTANCES: Record<string, Record<string, number>> = {
  'Boston, MA': {
    'Boston, MA': 12,
    'New York, NY': 345,
    'Philadelphia, PA': 490,
    'Baltimore, MD': 635,
    'Chicago, IL': 1570,
  },
  'New York, NY': {
    'Boston, MA': 345,
    'New York, NY': 10,
    'Philadelphia, PA': 155,
    'Baltimore, MD': 305,
    'Chicago, IL': 1270,
  },
  'Philadelphia, PA': {
    'Boston, MA': 490,
    'New York, NY': 155,
    'Philadelphia, PA': 8,
    'Baltimore, MD': 160,
    'Chicago, IL': 1210,
  },
  'Baltimore, MD': {
    'Boston, MA': 635,
    'New York, NY': 305,
    'Philadelphia, PA': 160,
    'Baltimore, MD': 14,
    'Chicago, IL': 1120,
  },
  'Chicago, IL': {
    'Boston, MA': 1570,
    'New York, NY': 1270,
    'Philadelphia, PA': 1210,
    'Baltimore, MD': 1120,
    'Chicago, IL': 15,
  },
};

export function getDistance(locA: string, locB: string): number {
  if (CITY_DISTANCES[locA] && CITY_DISTANCES[locA][locB] !== undefined) {
    return CITY_DISTANCES[locA][locB];
  }
  return 250; // default average fallback
}

// In-memory / localStorage reactive store manager
const STORAGE_KEY = 'organ_network_db_v1';

interface StoredDb {
  donors: Donor[];
  recipients: Recipient[];
  hospitals: Hospital[];
  matchRequests: MatchRequest[];
  allocations: Allocation[];
}

export function loadDatabase(): StoredDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to parse stored DB, resetting to defaults', e);
  }
  const initial: StoredDb = {
    donors: INITIAL_DONORS,
    recipients: INITIAL_RECIPIENTS,
    hospitals: INITIAL_HOSPITALS,
    matchRequests: INITIAL_MATCH_REQUESTS,
    allocations: INITIAL_ALLOCATIONS,
  };
  saveDatabase(initial);
  return initial;
}

export function saveDatabase(db: StoredDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Failed to persist DB to localStorage', e);
  }
}

export function resetDatabase(): StoredDb {
  localStorage.removeItem(STORAGE_KEY);
  return loadDatabase();
}

// Matching algorithm calculation (mimics backend ranking Cypher graph traversal)
export function computeCandidatesForRecipient(recipient: Recipient, donors: Donor[]): MatchCandidate[] {
  const compatibleBlood = ABO_COMPATIBILITY[recipient.blood_type] || [];

  const candidates: MatchCandidate[] = [];

  for (const donor of donors) {
    // Only available donors
    if (donor.status !== 'AVAILABLE') continue;

    // Organ must match
    if (donor.organ_type !== recipient.organ_needed) continue;

    // Blood type must be compatible
    if (!compatibleBlood.includes(donor.blood_type)) continue;

    const isExactBlood = donor.blood_type === recipient.blood_type;
    const distance = getDistance(donor.location, recipient.location);

    // Calculate time remaining before expiry
    const msUntilExpiry = new Date(donor.expires_at).getTime() - Date.now();
    if (msUntilExpiry <= 0) continue; // expired donor not candidate

    const hoursUntilExpiry = msUntilExpiry / (60 * 60 * 1000);

    // Score components (0 - 100):
    // 1. Blood match: Exact = 40 pts, Compatible = 30 pts
    // 2. Distance: closer is better (up to 30 pts)
    // 3. Recipient urgency: higher urgency = up to 20 pts
    // 4. Viability buffer: more than 4 hours = up to 10 pts
    let score = 0;
    score += isExactBlood ? 40 : 30;

    const distScore = Math.max(0, 30 - (distance / 50));
    score += distScore;

    const urgencyScore = (recipient.urgency_score / 100) * 20;
    score += urgencyScore;

    const viabilityScore = Math.min(10, (hoursUntilExpiry / 12) * 10);
    score += viabilityScore;

    // Simulated HLA match
    const hlaMatchScore = isExactBlood ? 88 + Math.floor(Math.random() * 10) : 74 + Math.floor(Math.random() * 15);

    candidates.push({
      donor_id: donor.id,
      donor_name: donor.name,
      blood_type: donor.blood_type,
      organ_type: donor.organ_type,
      distance_km: distance,
      match_score: Math.min(99.9, Math.round(score * 10) / 10),
      donor_status: donor.status,
      expires_at: donor.expires_at,
      hospital_id: donor.hospital_id,
      hospital_name: donor.hospital_name || 'Donor Hospital',
      blood_compatibility: isExactBlood ? 'EXACT' : 'COMPATIBLE',
      hla_match_score: hlaMatchScore,
      crossmatch_result: 'NEGATIVE',
    });
  }

  // Rank by match score descending
  return candidates.sort((a, b) => b.match_score - a.match_score);
}

// Generate Graph payload for /graph/:matchId
export function generateGraphForMatch(matchId: string, db: StoredDb): MatchGraphData {
  const match = db.matchRequests.find((m) => m.id === matchId) || db.matchRequests[0];
  const donor = db.donors.find((d) => d.id === match.donor_id);
  const recipient = db.recipients.find((r) => r.id === match.recipient_id);
  const donorHosp = db.hospitals.find((h) => h.id === donor?.hospital_id) || db.hospitals[0];
  const recipHosp = db.hospitals.find((h) => h.id === recipient?.hospital_id) || db.hospitals[1];
  const allocation = db.allocations.find((a) => a.match_request_id === matchId);

  const nodes: GraphNode[] = [
    {
      id: donor ? donor.id : 'D-UNKNOWN',
      label: donor ? donor.name : 'Donor',
      type: 'DONOR' as const,
      properties: {
        blood_type: donor?.blood_type || 'Unknown',
        organ: donor?.organ_type || 'Unknown',
        status: donor?.status || 'Unknown',
        location: donor?.location || 'Unknown',
      },
    },
    {
      id: recipient ? recipient.id : 'R-UNKNOWN',
      label: recipient ? recipient.name : 'Recipient',
      type: 'RECIPIENT' as const,
      properties: {
        blood_type: recipient?.blood_type || 'Unknown',
        organ_needed: recipient?.organ_needed || 'Unknown',
        urgency: recipient?.urgency_score || 0,
        status: recipient?.status || 'Unknown',
      },
    },
    {
      id: donorHosp.id,
      label: donorHosp.name,
      type: 'HOSPITAL' as const,
      properties: {
        role: 'Donor Procurement Hospital',
        location: donorHosp.location,
        tier: donorHosp.tier,
      },
    },
    {
      id: recipHosp.id,
      label: recipHosp.name,
      type: 'HOSPITAL' as const,
      properties: {
        role: 'Recipient Transplant Hospital',
        location: recipHosp.location,
        tier: recipHosp.tier,
      },
    },
    {
      id: match.id,
      label: `Match Request (${match.match_score} pts)`,
      type: 'MATCH_REQUEST' as const,
      properties: {
        score: match.match_score,
        status: match.status,
        date: match.request_date,
      },
    },
  ];

  if (allocation) {
    nodes.push({
      id: allocation.id,
      label: `Allocation (${allocation.transplant_status})`,
      type: 'ALLOCATION' as const,
      properties: {
        confirmed_by: allocation.confirming_hospital_name,
        date: allocation.confirmation_date,
        transplant_status: allocation.transplant_status,
      },
    });
  }

  const edges: GraphEdge[] = [
    {
      id: 'e-1',
      source: donor?.id || 'D-101',
      target: donorHosp.id,
      relationship: 'DONATED_AT' as const,
    },
    {
      id: 'e-2',
      source: recipient?.id || 'R-201',
      target: recipHosp.id,
      relationship: 'WAITING_AT' as const,
    },
    {
      id: 'e-3',
      source: match.id,
      target: donor?.id || 'D-101',
      relationship: 'AFFILIATED_WITH' as const,
    },
    {
      id: 'e-4',
      source: match.id,
      target: recipient?.id || 'R-201',
      relationship: 'MATCHED_TO' as const,
    },
  ];

  if (allocation) {
    edges.push({
      id: 'e-5',
      source: allocation.id,
      target: match.id,
      relationship: 'ALLOCATED_BY' as const,
    });
    edges.push({
      id: 'e-6',
      source: donor?.id || 'D-101',
      target: recipHosp.id,
      relationship: 'TRANSFERRED_TO' as const,
    });
  }

  return {
    match_id: match.id,
    nodes,
    edges,
  };
}
