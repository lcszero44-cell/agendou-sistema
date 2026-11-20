/**
 * Phase 0 Security Test Specification for Firestore Rules ("Dirty Dozen").
 * Verifies all 12 adversarial payloads are rejected with PERMISSION_DENIED.
 * Intended to run against the Firebase Firestore Emulator (`@firebase/rules-unit-testing`).
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  actor: 'visitor' | 'unverified_admin' | 'other_store_admin' | 'token_holder';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated visitor listing private appointments (PII leak)',
    actor: 'visitor',
    operation: 'list',
    path: 'stores/clinica-sorriso/appointments',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-store admin reading another store waitlist',
    actor: 'other_store_admin',
    operation: 'list',
    path: 'stores/clinica-sorriso/waitlist',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Email spoofing with email_verified = false',
    actor: 'unverified_admin',
    operation: 'update',
    path: 'stores/clinica-sorriso',
    payload: { name: 'Hacked Clinic' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow field injection on appointment create',
    actor: 'visitor',
    operation: 'create',
    path: 'stores/clinica-sorriso/appointments/appt-shadow',
    payload: { storeId: 'clinica-sorriso', isAdminApproved: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Overwriting active slotLock belonging to another booking',
    actor: 'visitor',
    operation: 'update',
    path: 'stores/clinica-sorriso/slotLocks/prof-1_2026-11-22_600',
    payload: { status: 'released', manageToken: 'forged_token_12345678901234567890' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned appointment created without atomic slotLock',
    actor: 'visitor',
    operation: 'create',
    path: 'stores/clinica-sorriso/appointments/appt-orphan',
    payload: { storeId: 'clinica-sorriso', blockLockIds: ['missing_lock_id'] },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Status forgery on public booking creation',
    actor: 'visitor',
    operation: 'create',
    path: 'stores/clinica-sorriso/appointments/appt-forged-status',
    payload: { status: 'concluido', lgpdConsent: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'LGPD consent bypass (lgpdConsent = false)',
    actor: 'visitor',
    operation: 'create',
    path: 'stores/clinica-sorriso/appointments/appt-no-lgpd',
    payload: { status: 'agendado', lgpdConsent: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Enumerating client bookingTokens collection',
    actor: 'visitor',
    operation: 'list',
    path: 'stores/clinica-sorriso/bookingTokens',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Modifying terminal status appointment via token',
    actor: 'token_holder',
    operation: 'update',
    path: 'stores/clinica-sorriso/appointments/appt-completed',
    payload: { status: 'cancelado' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'ID poisoning with oversized document ID',
    actor: 'other_store_admin',
    operation: 'create',
    path: `stores/clinica-sorriso/services/${'a'.repeat(160)}`,
    payload: { name: 'Bad ID' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Backdated createdAt timestamp forgery',
    actor: 'visitor',
    operation: 'create',
    path: 'stores/clinica-sorriso/appointments/appt-backdate',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
];
