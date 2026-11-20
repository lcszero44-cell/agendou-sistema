# Security Specification — Multi-Store Online Scheduling System

## 1. Data Invariants
1. **Store Isolation (`storeId`)**: Every sub-collection document (`services`, `staff`, `slotLocks`, `appointments`, `bookingTokens`, `waitlist`) MUST contain `storeId == path.storeId`, immutable after creation.
2. **PII Isolation (LGPD)**: Visitors can NEVER `get`, `list`, or `delete` `/stores/{storeId}/appointments` or `/stores/{storeId}/waitlist`. Public availability is served strictly from `/stores/{storeId}/slotLocks` which stores zero customer PII.
3. **Anti-Double-Booking Atomicity**: Every public appointment creation MUST atomically write at least one `/slotLocks/{lockId}` document in the same Firestore transaction (`existsAfter`), and active locks cannot be overwritten by another client.
4. **Capability Self-Service (`bookingTokens`)**: `list` is permanently denied (`allow list: if false`). Exact-ID `get` requires a >= 24-character token ID. Self-service cancellation/rescheduling on `appointments` requires matching `existing().manageToken` and only allows transitions from `agendado`/`confirmado`.
5. **Admin Identity Integrity**: Admin access requires `request.auth != null && request.auth.token.email_verified == true` AND either bootstrapped owner email or `stores/{storeId}.ownerId == request.auth.uid`.
6. **Temporal Integrity**: `createdAt == request.time` on create; `createdAt` immutable and `updatedAt == request.time` on update.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Appointment Read**: Visitor tries `get` or `list` on `/stores/clinica-sorriso/appointments`.
2. **Cross-Store Admin Read**: Authenticated admin of `store-b` attempts `list` on `/stores/clinica-sorriso/appointments`.
3. **Unverified Email Spoofing**: User with `email: 'lucaroch222@gmail.com'` and `email_verified: false` attempts to update `/stores/clinica-sorriso`.
4. **Shadow Field Injection**: Visitor creates an appointment with an extra ghost field `isAdminApproved: true`.
5. **Double-Booking Lock Overwrite**: Visitor attempts to update an existing `active` `/slotLocks/{lockId}` with a different `manageToken`.
6. **Orphaned Appointment Without SlotLock**: Visitor creates an `/appointments/{id}` without creating `/slotLocks/{blockLockIds[0]}` in the same transaction.
7. **Status Forgery on Public Create**: Visitor creates an appointment with `status: 'concluido'` instead of `'agendado'`.
8. **LGPD Consent Bypass**: Visitor creates an appointment with `lgpdConsent: false`.
9. **BookingToken Enumeration**: Visitor tries `list` on `/stores/clinica-sorriso/bookingTokens`.
10. **Terminal State Tampering**: Client with manageToken attempts to cancel or reschedule an appointment whose status is already `'concluido'` or `'faltou'`.
11. **ID Poisoning / Oversized Payload**: Attacker attempts to create a service with a 200-char ID or 10KB name string.
12. **Client Timestamp Forgery**: Attacker creates an appointment with backdated `createdAt` instead of `request.time`.
