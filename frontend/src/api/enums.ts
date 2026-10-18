/**
 * Verified enum value mappings between the FastAPI backend (app/schemas/enums.py)
 * and the frontend UI model (src/types/index.ts).
 *
 * ALL values in this file were verified against the actual backend schemas.
 * Do not add mappings here without checking the backend schema first.
 *
 * Backend enums serialize as human-readable strings ("Available", "Pending", ...),
 * while the frontend UI uses canonical uppercase codes ("AVAILABLE", "PENDING", ...).
 */

// ---------------------------------------------------------------------------
// Blood types (identical spelling on both sides)
// ---------------------------------------------------------------------------
export const BACKEND_BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const;
export type BackendBloodType = (typeof BACKEND_BLOOD_TYPES)[number];

// ---------------------------------------------------------------------------
// Organ types — backend supports only these six (verified).
// Frontend additionally has mock-only organ values ('Cornea', 'Whole Blood',
// 'Platelets') which may NOT be sent to the live backend.
// ---------------------------------------------------------------------------
export const BACKEND_ORGAN_TYPES = ['Kidney', 'Liver', 'Heart', 'Lung', 'Pancreas', 'Blood'] as const;
export type BackendOrganType = (typeof BACKEND_ORGAN_TYPES)[number];

// ---------------------------------------------------------------------------
// Donor status: backend 'Available' | 'Reserved' | 'Allocated' | 'Expired'
//               frontend 'AVAILABLE' | 'MATCHED' | 'ALLOCATED' | 'EXPIRED'
// (frontend 'MATCHED' exists only as a mock-mode status)
// ---------------------------------------------------------------------------
export const BACKEND_DONOR_STATUSES = ['Available', 'Reserved', 'Allocated', 'Expired'] as const;
export type BackendDonorStatus = (typeof BACKEND_DONOR_STATUSES)[number];

export function donorStatusToUi(status: string): string {
  return status.toUpperCase();
}

export function uiDonorStatusToBackend(status: string): BackendDonorStatus {
  const map: Record<string, BackendDonorStatus> = {
    AVAILABLE: 'Available',
    RESERVED: 'Reserved',
    ALLOCATED: 'Allocated',
    EXPIRED: 'Expired',
  };
  const mapped = map[status.toUpperCase()];
  if (!mapped) throw new Error(`Unknown donor status: ${status}`);
  return mapped;
}

// ---------------------------------------------------------------------------
// Recipient status: backend 'Waiting' | 'Allocated'
//                   frontend 'WAITING' | 'MATCHED' | 'TRANSPLANTED' | 'INACTIVE'
// ---------------------------------------------------------------------------
export const BACKEND_RECIPIENT_STATUSES = ['Waiting', 'Allocated'] as const;
export type BackendRecipientStatus = (typeof BACKEND_RECIPIENT_STATUSES)[number];

export function recipientStatusToUi(status: string): string {
  return status.toUpperCase();
}

export function uiRecipientStatusToBackend(status: string): BackendRecipientStatus {
  const map: Record<string, BackendRecipientStatus> = {
    WAITING: 'Waiting',
    ALLOCATED: 'Allocated',
  };
  const mapped = map[status.toUpperCase()];
  if (!mapped) throw new Error(`Unknown recipient status: ${status}`);
  return mapped;
}

// ---------------------------------------------------------------------------
// Match request status: backend 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled'
//                       frontend 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CONFLICT'
// ---------------------------------------------------------------------------
export const BACKEND_MATCH_REQUEST_STATUSES = ['Pending', 'Confirmed', 'Rejected', 'Cancelled'] as const;
export type BackendMatchRequestStatus = (typeof BACKEND_MATCH_REQUEST_STATUSES)[number];

export function matchRequestStatusToUi(status: string): string {
  return status.toUpperCase();
}

export function uiMatchRequestStatusToBackend(status: string): BackendMatchRequestStatus {
  const map: Record<string, BackendMatchRequestStatus> = {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
  };
  const mapped = map[status.toUpperCase()];
  if (!mapped) throw new Error(`Unknown match request status: ${status}`);
  return mapped;
}

// ---------------------------------------------------------------------------
// Allocation status: backend 'Confirmed' | 'Cancelled' (frontend shows the
// backend status directly for live data; mock uses transplant statuses)
// ---------------------------------------------------------------------------
export const BACKEND_ALLOCATION_STATUSES = ['Confirmed', 'Cancelled'] as const;

export function allocationStatusToUi(status: string): string {
  return status.toUpperCase();
}

// ---------------------------------------------------------------------------
// Roles: identical spelling on both sides (verified)
// ---------------------------------------------------------------------------
export const BACKEND_USER_ROLES = ['ADMIN', 'COORDINATOR', 'DOCTOR', 'AUDITOR'] as const;
export type BackendRole = (typeof BACKEND_USER_ROLES)[number];

// ---------------------------------------------------------------------------
// Urgency scale: backend score is strictly 1-10 (verified in RecipientBase and
// RecipientUrgencyUpdate). The mock frontend uses 1-100. Both are valid in
// their own mode; the live adapter never rescales automatically.
// ---------------------------------------------------------------------------
export const BACKEND_URGENCY_MAX = 10;
export const MOCK_URGENCY_MAX = 100;
