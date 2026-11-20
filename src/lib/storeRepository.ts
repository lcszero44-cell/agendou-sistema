import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  getTemplateByStoreIdOrSegment,
  SEGMENT_TEMPLATES,
} from '../config/segmentTemplates';
import {
  AppointmentRecord,
  AppointmentStatus,
  BookingTokenView,
  ClientLockRecord,
  ReminderResponse,
  SegmentKey,
  ServiceItem,
  SlotLockRecord,
  StaffMember,
  StoreConfig,
  WaitlistPeriod,
  WaitlistRecord,
  WaitlistStatus,
} from '../types/booking';
import { buildBlockLockIds, buildClientBlockLockIds } from './availability';
import {
  BLOCK_SIZE_MINUTES,
  dispatchAutomationWebhook,
  generateSecureToken,
  hashClientPhone,
  minutesToTime,
  normalizeBrazilianWhatsapp,
  toISODateLocal,
} from './brUtils';
import { db, handleFirestoreError, OperationType } from './firebase';

// --- Local Preview Cache (only used when viewing an unseeded demo template before Admin publishes to Firestore) ---

interface LocalPreviewState {
  slotLocks: SlotLockRecord[];
  clientLocks?: ClientLockRecord[];
  tokens: Record<string, BookingTokenView & { appointment: AppointmentRecord }>;
  waitlist: WaitlistRecord[];
}

function getPreviewStorageKey(storeId: string): string {
  return `agendou_preview_v1_${storeId}`;
}

function loadPreviewState(storeId: string): LocalPreviewState {
  try {
    const raw = localStorage.getItem(getPreviewStorageKey(storeId));
    if (raw) return JSON.parse(raw) as LocalPreviewState;
  } catch {
    // ignore storage quota errors
  }
  return { slotLocks: [], tokens: {}, waitlist: [] };
}

function savePreviewState(storeId: string, state: LocalPreviewState): void {
  try {
    localStorage.setItem(getPreviewStorageKey(storeId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

export interface PublicStoreBundle {
  store: StoreConfig;
  services: ServiceItem[];
  staff: StaffMember[];
  slotLocks: SlotLockRecord[];
  isLiveFirestore: boolean;
}

/**
 * Loads store, services, staff, and active slotLocks.
 * Reads from live Firestore first; falls back seamlessly to demo segment template if not yet seeded.
 */
export async function loadPublicStoreBundle(
  storeId: string,
  segmentOverride?: SegmentKey | null
): Promise<PublicStoreBundle> {
  if (segmentOverride) {
    const tpl = SEGMENT_TEMPLATES[segmentOverride];
    const preview = loadPreviewState(tpl.store.storeId);
    return {
      store: { ...tpl.store, isLiveFirestore: false },
      services: tpl.services,
      staff: tpl.staff,
      slotLocks: preview.slotLocks.filter((l) => l.status === 'active'),
      isLiveFirestore: false,
    };
  }

  const storePath = `stores/${storeId}`;
  try {
    const storeSnap = await getDoc(doc(db, 'stores', storeId));
    if (storeSnap.exists()) {
      const storeData = storeSnap.data() as StoreConfig;
      const [servicesSnap, staffSnap, locksSnap] = await Promise.all([
        getDocs(query(collection(db, 'stores', storeId, 'services'), where('storeId', '==', storeId))),
        getDocs(query(collection(db, 'stores', storeId, 'staff'), where('storeId', '==', storeId))),
        getDocs(query(collection(db, 'stores', storeId, 'slotLocks'), where('storeId', '==', storeId))),
      ]);

      const services: ServiceItem[] = servicesSnap.docs
        .map((d) => ({ ...(d.data() as Omit<ServiceItem, 'id'>), id: d.id }))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      const staff: StaffMember[] = staffSnap.docs.map((d) => ({
        ...(d.data() as Omit<StaffMember, 'id'>),
        id: d.id,
      }));

      const slotLocks: SlotLockRecord[] = locksSnap.docs
        .map((d) => ({ ...(d.data() as Omit<SlotLockRecord, 'id'>), id: d.id }))
        .filter((l) => l.status === 'active');

      return {
        store: { ...storeData, storeId, isLiveFirestore: true },
        services,
        staff,
        slotLocks,
        isLiveFirestore: true,
      };
    }
  } catch (err) {
    console.warn(`Fallback para modelo de demonstração (${storePath}):`, err);
  }

  // Fallback to demo template
  const tpl = getTemplateByStoreIdOrSegment(storeId, null);
  const preview = loadPreviewState(tpl.store.storeId);
  return {
    store: { ...tpl.store, isLiveFirestore: false },
    services: tpl.services,
    staff: tpl.staff,
    slotLocks: preview.slotLocks.filter((l) => l.status === 'active'),
    isLiveFirestore: false,
  };
}

/**
 * Atomic booking creation using Firestore runTransaction to prevent double bookings.
 * Acquires every 15-minute slotLock block + creates appointment + creates bookingToken.
 */
export async function createBookingAtomic(params: {
  store: StoreConfig;
  service: ServiceItem;
  staff: StaffMember;
  date: string;
  startMinute: number;
  clientName: string;
  clientWhatsapp: string;
  clientEmail?: string;
  clientNotes?: string;
  lgpdConsent: boolean;
  initialStatus?: AppointmentStatus;
}): Promise<{ appointment: AppointmentRecord; manageToken: string }> {
  const {
    store,
    service,
    staff,
    date,
    startMinute,
    clientName,
    clientWhatsapp,
    clientEmail,
    clientNotes,
    lgpdConsent,
    initialStatus = 'agendado',
  } = params;

  const endMinute = startMinute + service.durationMinutes + (service.bufferMinutes || 0);
  const blockLockIds = buildBlockLockIds(staff.id, date, startMinute, endMinute);
  const appointmentId = generateSecureToken(28);
  const manageToken = generateSecureToken(32);
  const normalizedPhone = normalizeBrazilianWhatsapp(clientWhatsapp);
  const clientPhoneHash = await hashClientPhone(normalizedPhone);
  const clientBlockLockIds = buildClientBlockLockIds(clientPhoneHash, date, startMinute, endMinute);
  const cleanName = clientName.trim().slice(0, 90);
  const firstName = cleanName.split(/\s+/)[0]?.slice(0, 45) || 'Cliente';
  const depositAmountCents = service.requiresDeposit ? service.depositAmountCents : 0;

  const appointmentRecord: AppointmentRecord = {
    id: appointmentId,
    storeId: store.storeId,
    storeOwnerId: store.ownerId,
    serviceId: service.id,
    serviceName: service.name.slice(0, 90),
    staffId: staff.id,
    staffName: staff.name.slice(0, 80),
    date,
    startMinute,
    endMinute,
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    depositAmountCents,
    status: initialStatus,
    clientName: cleanName,
    clientWhatsapp: normalizedPhone,
    clientEmail: clientEmail?.trim().slice(0, 120) || '',
    clientNotes: clientNotes?.trim().slice(0, 400) || '',
    lgpdConsent,
    manageToken,
    clientAuthToken: '',
    blockLockIds,
    clientBlockLockIds,
    createdAtIso: new Date().toISOString(),
  };

  if (!store.isLiveFirestore) {
    // Local demo preview atomic conflict check (staff slot + same client WhatsApp overlap)
    const preview = loadPreviewState(store.storeId);
    const activeIds = new Set(preview.slotLocks.filter((l) => l.status === 'active').map((l) => l.id));
    for (const lid of blockLockIds) {
      if (activeIds.has(lid)) {
        throw new Error('Este horário acabou de ser reservado por outro cliente. Escolha outro horário livre.');
      }
    }
    const activeClientIds = new Set(
      (preview.clientLocks || []).filter((l) => l.status === 'active').map((l) => l.id)
    );
    for (const cid of clientBlockLockIds) {
      if (activeClientIds.has(cid)) {
        throw new Error(
          'Você já possui um agendamento neste mesmo dia e horário com este WhatsApp. Para alterar, use o link do seu agendamento ou escolha outro horário.'
        );
      }
    }

    const newLocks: SlotLockRecord[] = blockLockIds.map((lid, idx) => ({
      id: lid,
      storeId: store.storeId,
      staffId: staff.id,
      date,
      blockMinute: Math.floor(startMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES,
      startMinute,
      endMinute,
      appointmentId,
      manageToken,
      releaseToken: '',
      status: 'active',
    }));
    const newClientLocks: ClientLockRecord[] = clientBlockLockIds.map((cid, idx) => ({
      id: cid,
      storeId: store.storeId,
      clientHash: clientPhoneHash,
      date,
      blockMinute: Math.floor(startMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES,
      appointmentId,
      manageToken,
      releaseToken: '',
      status: 'active',
    }));
    preview.slotLocks = [...preview.slotLocks.filter((l) => !blockLockIds.includes(l.id)), ...newLocks];
    preview.clientLocks = [
      ...(preview.clientLocks || []).filter((l) => !clientBlockLockIds.includes(l.id)),
      ...newClientLocks,
    ];
    preview.tokens[manageToken] = {
      token: manageToken,
      storeId: store.storeId,
      appointmentId,
      serviceId: service.id,
      serviceName: appointmentRecord.serviceName,
      staffId: staff.id,
      staffName: appointmentRecord.staffName,
      date,
      startMinute,
      endMinute,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      depositAmountCents,
      status: initialStatus,
      clientFirstName: firstName,
      blockLockIds,
      clientBlockLockIds,
      clientPhoneHash,
      appointment: appointmentRecord,
    };
    savePreviewState(store.storeId, preview);
    dispatchAutomationWebhook(store, 'novo_agendamento', {
      appointmentId,
      cliente: cleanName,
      whatsapp: normalizedPhone,
      servico: appointmentRecord.serviceName,
      profissional: appointmentRecord.staffName,
      data: date,
      hora: minutesToTime(startMinute),
      status: initialStatus,
    });
    return { appointment: appointmentRecord, manageToken };
  }

  // Live Firestore Transaction (Anti-Double-Booking + Anti-Client-Overlap)
  const path = `stores/${store.storeId}/appointments/${appointmentId}`;
  try {
    await runTransaction(db, async (tx) => {
      const lockRefs = blockLockIds.map((lid) => doc(db, 'stores', store.storeId, 'slotLocks', lid));
      const clientLockRefs = clientBlockLockIds.map((cid) =>
        doc(db, 'stores', store.storeId, 'clientLocks', cid)
      );

      const [lockSnaps, clientLockSnaps] = await Promise.all([
        Promise.all(lockRefs.map((ref) => tx.get(ref))),
        Promise.all(clientLockRefs.map((ref) => tx.get(ref))),
      ]);

      for (const snap of clientLockSnaps) {
        if (snap.exists() && snap.data()?.status === 'active') {
          throw new Error('CLIENT_CONFLICT');
        }
      }

      for (const snap of lockSnaps) {
        if (snap.exists() && snap.data()?.status === 'active') {
          throw new Error('SLOT_CONFLICT');
        }
      }

      const nowTs = serverTimestamp();

      // Acquire or re-acquire every staff slot block lock
      lockRefs.forEach((ref, idx) => {
        const blockMinute =
          Math.floor(startMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES;
        if (lockSnaps[idx].exists()) {
          tx.update(ref, {
            appointmentId,
            manageToken,
            releaseToken: '',
            startMinute,
            endMinute,
            status: 'active',
            updatedAt: nowTs,
          });
        } else {
          tx.set(ref, {
            storeId: store.storeId,
            staffId: staff.id,
            date,
            blockMinute,
            startMinute,
            endMinute,
            appointmentId,
            manageToken,
            releaseToken: '',
            status: 'active',
            createdAt: nowTs,
            updatedAt: nowTs,
          });
        }
      });

      // Acquire or re-acquire every client overlap block lock (zero PII: hashed phone)
      clientLockRefs.forEach((ref, idx) => {
        const blockMinute =
          Math.floor(startMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES;
        if (clientLockSnaps[idx].exists()) {
          tx.update(ref, {
            appointmentId,
            manageToken,
            releaseToken: '',
            status: 'active',
            updatedAt: nowTs,
          });
        } else {
          tx.set(ref, {
            storeId: store.storeId,
            clientHash: clientPhoneHash,
            date,
            blockMinute,
            appointmentId,
            manageToken,
            releaseToken: '',
            status: 'active',
            createdAt: nowTs,
            updatedAt: nowTs,
          });
        }
      });

      // Write private appointment
      const apptRef = doc(db, 'stores', store.storeId, 'appointments', appointmentId);
      const apptPayload: Record<string, unknown> = {
        storeId: store.storeId,
        storeOwnerId: store.ownerId,
        serviceId: service.id,
        serviceName: appointmentRecord.serviceName,
        staffId: staff.id,
        staffName: appointmentRecord.staffName,
        date,
        startMinute,
        endMinute,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        depositAmountCents,
        status: initialStatus,
        clientName: cleanName,
        clientWhatsapp: normalizedPhone,
        lgpdConsent: true,
        manageToken,
        clientAuthToken: '',
        blockLockIds,
        clientBlockLockIds,
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      if (appointmentRecord.clientEmail) apptPayload.clientEmail = appointmentRecord.clientEmail;
      if (appointmentRecord.clientNotes) apptPayload.clientNotes = appointmentRecord.clientNotes;
      tx.set(apptRef, apptPayload);

      // Write capability token doc for self-service view/reschedule/cancel
      const tokenRef = doc(db, 'stores', store.storeId, 'bookingTokens', manageToken);
      tx.set(tokenRef, {
        storeId: store.storeId,
        appointmentId,
        serviceId: service.id,
        serviceName: appointmentRecord.serviceName,
        staffId: staff.id,
        staffName: appointmentRecord.staffName,
        date,
        startMinute,
        endMinute,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        depositAmountCents,
        status: initialStatus,
        clientFirstName: firstName,
        blockLockIds,
        clientBlockLockIds,
        clientPhoneHash,
        createdAt: nowTs,
        updatedAt: nowTs,
      });
    });

    dispatchAutomationWebhook(store, 'novo_agendamento', {
      appointmentId,
      cliente: cleanName,
      whatsapp: normalizedPhone,
      servico: appointmentRecord.serviceName,
      profissional: appointmentRecord.staffName,
      data: date,
      hora: minutesToTime(startMinute),
      status: initialStatus,
    });

    return { appointment: appointmentRecord, manageToken };
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIENT_CONFLICT') {
      throw new Error(
        'Você já possui um agendamento neste mesmo dia e horário com este WhatsApp. Para alterar, use o link do seu agendamento ou escolha outro horário.'
      );
    }
    if (error instanceof Error && error.message === 'SLOT_CONFLICT') {
      throw new Error('Este horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário.');
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchBookingByToken(
  store: StoreConfig,
  token: string
): Promise<BookingTokenView | null> {
  if (!token || token.length < 24) return null;

  if (!store.isLiveFirestore) {
    const preview = loadPreviewState(store.storeId);
    const entry = preview.tokens[token];
    if (!entry) return null;
    const { appointment: _a, ...view } = entry;
    return view;
  }

  const path = `stores/${store.storeId}/bookingTokens/${token}`;
  try {
    const snap = await getDoc(doc(db, 'stores', store.storeId, 'bookingTokens', token));
    if (!snap.exists()) return null;
    return { ...(snap.data() as Omit<BookingTokenView, 'token'>), token: snap.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function cancelBookingByToken(
  store: StoreConfig,
  booking: BookingTokenView
): Promise<void> {
  const clientLockIds = booking.clientBlockLockIds || [];

  if (!store.isLiveFirestore) {
    const preview = loadPreviewState(store.storeId);
    const savedClientWhatsapp = preview.tokens[booking.token]?.appointment?.clientWhatsapp || '';
    if (preview.tokens[booking.token]) {
      preview.tokens[booking.token].status = 'cancelado';
      preview.tokens[booking.token].appointment.status = 'cancelado';
    }
    preview.slotLocks = preview.slotLocks.map((l) =>
      booking.blockLockIds.includes(l.id) ? { ...l, status: 'released' } : l
    );
    preview.clientLocks = (preview.clientLocks || []).map((l) =>
      clientLockIds.includes(l.id) ? { ...l, status: 'released' } : l
    );
    savePreviewState(store.storeId, preview);
    dispatchAutomationWebhook(store, 'cancelamento', {
      appointmentId: booking.appointmentId,
      cliente: booking.clientFirstName,
      whatsapp: savedClientWhatsapp,
      servico: booking.serviceName,
      profissional: booking.staffName,
      data: booking.date,
      hora: minutesToTime(booking.startMinute),
      status: 'cancelado',
    });
    return;
  }

  const path = `stores/${store.storeId}/bookingTokens/${booking.token}`;
  try {
    await runTransaction(db, async (tx) => {
      const nowTs = serverTimestamp();
      const tokenRef = doc(db, 'stores', store.storeId, 'bookingTokens', booking.token);
      const apptRef = doc(db, 'stores', store.storeId, 'appointments', booking.appointmentId);

      // Release all slot locks back to the calendar using releaseToken proof
      for (const lockId of booking.blockLockIds) {
        const lockRef = doc(db, 'stores', store.storeId, 'slotLocks', lockId);
        tx.update(lockRef, {
          status: 'released',
          releaseToken: booking.token,
          updatedAt: nowTs,
        });
      }

      // Release all client overlap locks using releaseToken proof
      for (const cLockId of clientLockIds) {
        const cLockRef = doc(db, 'stores', store.storeId, 'clientLocks', cLockId);
        tx.update(cLockRef, {
          status: 'released',
          releaseToken: booking.token,
          updatedAt: nowTs,
        });
      }

      tx.update(apptRef, {
        status: 'cancelado',
        clientAuthToken: booking.token,
        updatedAt: nowTs,
      });

      tx.update(tokenRef, {
        status: 'cancelado',
        updatedAt: nowTs,
      });
    });

    dispatchAutomationWebhook(store, 'cancelamento', {
      appointmentId: booking.appointmentId,
      cliente: booking.clientFirstName,
      whatsapp: '',
      servico: booking.serviceName,
      profissional: booking.staffName,
      data: booking.date,
      hora: minutesToTime(booking.startMinute),
      status: 'cancelado',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function rescheduleBookingByToken(params: {
  store: StoreConfig;
  booking: BookingTokenView;
  newStaff: StaffMember;
  newDate: string;
  newStartMinute: number;
  bufferMinutes?: number;
}): Promise<BookingTokenView> {
  const { store, booking, newStaff, newDate, newStartMinute, bufferMinutes = 0 } = params;
  const newEndMinute = newStartMinute + booking.durationMinutes + bufferMinutes;
  const newLockIds = buildBlockLockIds(newStaff.id, newDate, newStartMinute, newEndMinute);
  const oldClientLockIds = booking.clientBlockLockIds || [];
  const clientPhoneHash = booking.clientPhoneHash || '';
  const newClientLockIds = clientPhoneHash
    ? buildClientBlockLockIds(clientPhoneHash, newDate, newStartMinute, newEndMinute)
    : [];

  if (!store.isLiveFirestore) {
    const preview = loadPreviewState(store.storeId);
    const activeOther = new Set(
      preview.slotLocks
        .filter((l) => l.status === 'active' && !booking.blockLockIds.includes(l.id))
        .map((l) => l.id)
    );
    for (const lid of newLockIds) {
      if (activeOther.has(lid)) {
        throw new Error('Este novo horário acabou de ser ocupado. Escolha outro.');
      }
    }
    if (newClientLockIds.length > 0) {
      const activeOtherClient = new Set(
        (preview.clientLocks || [])
          .filter((l) => l.status === 'active' && l.appointmentId !== booking.appointmentId)
          .map((l) => l.id)
      );
      for (const cid of newClientLockIds) {
        if (activeOtherClient.has(cid)) {
          throw new Error(
            'Você já possui outro agendamento neste mesmo dia e horário com este WhatsApp. Escolha outro horário.'
          );
        }
      }
    }

    const releasedOld = preview.slotLocks.map((l) =>
      booking.blockLockIds.includes(l.id) ? { ...l, status: 'released' as const } : l
    );
    const acquiredNew: SlotLockRecord[] = newLockIds.map((lid, idx) => ({
      id: lid,
      storeId: store.storeId,
      staffId: newStaff.id,
      date: newDate,
      blockMinute: Math.floor(newStartMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES,
      startMinute: newStartMinute,
      endMinute: newEndMinute,
      appointmentId: booking.appointmentId,
      manageToken: booking.token,
      releaseToken: '',
      status: 'active',
    }));
    preview.slotLocks = [...releasedOld.filter((l) => !newLockIds.includes(l.id)), ...acquiredNew];

    if (newClientLockIds.length > 0) {
      const releasedOldClient = (preview.clientLocks || []).map((l) =>
        oldClientLockIds.includes(l.id) ? { ...l, status: 'released' as const } : l
      );
      const acquiredNewClient: ClientLockRecord[] = newClientLockIds.map((cid, idx) => ({
        id: cid,
        storeId: store.storeId,
        clientHash: clientPhoneHash,
        date: newDate,
        blockMinute:
          Math.floor(newStartMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES,
        appointmentId: booking.appointmentId,
        manageToken: booking.token,
        releaseToken: '',
        status: 'active',
      }));
      preview.clientLocks = [
        ...releasedOldClient.filter((l) => !newClientLockIds.includes(l.id)),
        ...acquiredNewClient,
      ];
    }

    const updated: BookingTokenView = {
      ...booking,
      staffId: newStaff.id,
      staffName: newStaff.name,
      date: newDate,
      startMinute: newStartMinute,
      endMinute: newEndMinute,
      blockLockIds: newLockIds,
      clientBlockLockIds: newClientLockIds.length > 0 ? newClientLockIds : booking.clientBlockLockIds,
      status: 'agendado',
    };
    const savedClientWhatsapp = preview.tokens[booking.token]?.appointment?.clientWhatsapp || '';
    if (preview.tokens[booking.token]) {
      preview.tokens[booking.token] = {
        ...preview.tokens[booking.token],
        ...updated,
        appointment: {
          ...preview.tokens[booking.token].appointment,
          staffId: newStaff.id,
          staffName: newStaff.name,
          date: newDate,
          startMinute: newStartMinute,
          endMinute: newEndMinute,
          blockLockIds: newLockIds,
          clientBlockLockIds: newClientLockIds.length > 0 ? newClientLockIds : booking.clientBlockLockIds,
          status: 'agendado',
        },
      };
    }
    savePreviewState(store.storeId, preview);
    dispatchAutomationWebhook(store, 'remarcacao', {
      appointmentId: booking.appointmentId,
      cliente: booking.clientFirstName,
      whatsapp: savedClientWhatsapp,
      servico: booking.serviceName,
      profissional: newStaff.name,
      data: newDate,
      hora: minutesToTime(newStartMinute),
      status: 'agendado',
    });
    return updated;
  }

  const path = `stores/${store.storeId}/bookingTokens/${booking.token}`;
  try {
    await runTransaction(db, async (tx) => {
      const newLockRefs = newLockIds.map((lid) => doc(db, 'stores', store.storeId, 'slotLocks', lid));
      const newClientLockRefs = newClientLockIds.map((cid) =>
        doc(db, 'stores', store.storeId, 'clientLocks', cid)
      );

      const [newLockSnaps, newClientLockSnaps] = await Promise.all([
        Promise.all(newLockRefs.map((ref) => tx.get(ref))),
        Promise.all(newClientLockRefs.map((ref) => tx.get(ref))),
      ]);

      for (const snap of newClientLockSnaps) {
        if (
          snap.exists() &&
          snap.data()?.status === 'active' &&
          snap.data()?.appointmentId !== booking.appointmentId
        ) {
          throw new Error('CLIENT_CONFLICT');
        }
      }

      for (const snap of newLockSnaps) {
        if (
          snap.exists() &&
          snap.data()?.status === 'active' &&
          snap.data()?.appointmentId !== booking.appointmentId
        ) {
          throw new Error('SLOT_CONFLICT');
        }
      }

      const nowTs = serverTimestamp();

      // Release old staff locks not reused
      for (const oldId of booking.blockLockIds) {
        if (!newLockIds.includes(oldId)) {
          tx.update(doc(db, 'stores', store.storeId, 'slotLocks', oldId), {
            status: 'released',
            releaseToken: booking.token,
            updatedAt: nowTs,
          });
        }
      }

      // Release old client locks not reused
      if (newClientLockIds.length > 0) {
        for (const oldCid of oldClientLockIds) {
          if (!newClientLockIds.includes(oldCid)) {
            tx.update(doc(db, 'stores', store.storeId, 'clientLocks', oldCid), {
              status: 'released',
              releaseToken: booking.token,
              updatedAt: nowTs,
            });
          }
        }
      }

      // Acquire new staff locks
      newLockRefs.forEach((ref, idx) => {
        const blockMinute =
          Math.floor(newStartMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES;
        if (newLockSnaps[idx].exists()) {
          if (newLockSnaps[idx].data()?.appointmentId !== booking.appointmentId) {
            tx.update(ref, {
              appointmentId: booking.appointmentId,
              manageToken: booking.token,
              releaseToken: '',
              startMinute: newStartMinute,
              endMinute: newEndMinute,
              status: 'active',
              updatedAt: nowTs,
            });
          }
        } else {
          tx.set(ref, {
            storeId: store.storeId,
            staffId: newStaff.id,
            date: newDate,
            blockMinute,
            startMinute: newStartMinute,
            endMinute: newEndMinute,
            appointmentId: booking.appointmentId,
            manageToken: booking.token,
            releaseToken: '',
            status: 'active',
            createdAt: nowTs,
            updatedAt: nowTs,
          });
        }
      });

      // Acquire new client overlap locks
      newClientLockRefs.forEach((ref, idx) => {
        const blockMinute =
          Math.floor(newStartMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES;
        if (newClientLockSnaps[idx].exists()) {
          if (newClientLockSnaps[idx].data()?.appointmentId !== booking.appointmentId) {
            tx.update(ref, {
              appointmentId: booking.appointmentId,
              manageToken: booking.token,
              releaseToken: '',
              status: 'active',
              updatedAt: nowTs,
            });
          }
        } else {
          tx.set(ref, {
            storeId: store.storeId,
            clientHash: clientPhoneHash,
            date: newDate,
            blockMinute,
            appointmentId: booking.appointmentId,
            manageToken: booking.token,
            releaseToken: '',
            status: 'active',
            createdAt: nowTs,
            updatedAt: nowTs,
          });
        }
      });

      const apptUpdate: Record<string, unknown> = {
        date: newDate,
        startMinute: newStartMinute,
        endMinute: newEndMinute,
        staffId: newStaff.id,
        staffName: newStaff.name.slice(0, 80),
        blockLockIds: newLockIds,
        status: 'agendado',
        clientAuthToken: booking.token,
        updatedAt: nowTs,
      };
      const tokenUpdate: Record<string, unknown> = {
        date: newDate,
        startMinute: newStartMinute,
        endMinute: newEndMinute,
        staffId: newStaff.id,
        staffName: newStaff.name.slice(0, 80),
        blockLockIds: newLockIds,
        status: 'agendado',
        updatedAt: nowTs,
      };
      if (newClientLockIds.length > 0) {
        apptUpdate.clientBlockLockIds = newClientLockIds;
        tokenUpdate.clientBlockLockIds = newClientLockIds;
      }

      tx.update(doc(db, 'stores', store.storeId, 'appointments', booking.appointmentId), apptUpdate);
      tx.update(doc(db, 'stores', store.storeId, 'bookingTokens', booking.token), tokenUpdate);
    });

    dispatchAutomationWebhook(store, 'remarcacao', {
      appointmentId: booking.appointmentId,
      cliente: booking.clientFirstName,
      whatsapp: '',
      servico: booking.serviceName,
      profissional: newStaff.name,
      data: newDate,
      hora: minutesToTime(newStartMinute),
      status: 'agendado',
    });

    return {
      ...booking,
      staffId: newStaff.id,
      staffName: newStaff.name,
      date: newDate,
      startMinute: newStartMinute,
      endMinute: newEndMinute,
      blockLockIds: newLockIds,
      clientBlockLockIds: newClientLockIds.length > 0 ? newClientLockIds : booking.clientBlockLockIds,
      status: 'agendado',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIENT_CONFLICT') {
      throw new Error(
        'Você já possui outro agendamento neste mesmo dia e horário com este WhatsApp. Escolha outro horário.'
      );
    }
    if (error instanceof Error && error.message === 'SLOT_CONFLICT') {
      throw new Error('Este novo horário acabou de ser reservado. Escolha outro horário livre.');
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addWaitlistEntry(params: {
  store: StoreConfig;
  service: ServiceItem;
  staffId?: string;
  preferredDate: string;
  preferredPeriod: WaitlistPeriod;
  clientName: string;
  clientWhatsapp: string;
  lgpdConsent: boolean;
}): Promise<WaitlistRecord> {
  const entryId = generateSecureToken(24);
  const record: WaitlistRecord = {
    id: entryId,
    storeId: params.store.storeId,
    storeOwnerId: params.store.ownerId,
    serviceId: params.service.id,
    serviceName: params.service.name.slice(0, 90),
    staffId: params.staffId || '',
    preferredDate: params.preferredDate,
    preferredPeriod: params.preferredPeriod,
    clientName: params.clientName.trim().slice(0, 90),
    clientWhatsapp: normalizeBrazilianWhatsapp(params.clientWhatsapp),
    lgpdConsent: true,
    status: 'aguardando',
    createdAtIso: new Date().toISOString(),
  };

  if (!params.store.isLiveFirestore) {
    const preview = loadPreviewState(params.store.storeId);
    preview.waitlist = [record, ...preview.waitlist];
    savePreviewState(params.store.storeId, preview);
    return record;
  }

  const path = `stores/${params.store.storeId}/waitlist/${entryId}`;
  try {
    const nowTs = serverTimestamp();
    await setDoc(doc(db, 'stores', params.store.storeId, 'waitlist', entryId), {
      storeId: record.storeId,
      storeOwnerId: record.storeOwnerId,
      serviceId: record.serviceId,
      serviceName: record.serviceName,
      staffId: record.staffId || '',
      preferredDate: record.preferredDate,
      preferredPeriod: record.preferredPeriod,
      clientName: record.clientName,
      clientWhatsapp: record.clientWhatsapp,
      lgpdConsent: true,
      status: 'aguardando',
      createdAt: nowTs,
      updatedAt: nowTs,
    });
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ============================================================================
// ADMIN REPOSITORY OPERATIONS (Require verified Firebase Auth user)
// ============================================================================

export async function findAdminStoreIds(uid: string): Promise<StoreConfig[]> {
  const path = 'stores';
  try {
    // Each authorized admin accesses strictly their own stores (ownerId == uid)
    const q = query(collection(db, 'stores'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as StoreConfig), storeId: d.id, isLiveFirestore: true }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Seeds a store from a segment template into live Firestore, including services, staff,
 * admin binding, and realistic sample appointments for today/tomorrow so the admin agenda is immediately rich.
 */
export async function seedStoreFromTemplate(params: {
  segment: SegmentKey;
  ownerUid: string;
  ownerEmail: string;
  customStoreId?: string;
  customName?: string;
  customWhatsapp?: string;
  includeDemoAppointments?: boolean;
}): Promise<StoreConfig> {
  const tpl = SEGMENT_TEMPLATES[params.segment];
  const storeId = (params.customStoreId || tpl.store.storeId)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || tpl.store.storeId;

  const storePath = `stores/${storeId}`;
  try {
    const nowTs = serverTimestamp();
    const batch = writeBatch(db);

    const storePayload: Omit<StoreConfig, 'isLiveFirestore'> & { createdAt: unknown; updatedAt: unknown } = {
      ...tpl.store,
      storeId,
      slug: storeId,
      ownerId: params.ownerUid,
      name: (params.customName || tpl.store.name).slice(0, 80),
      whatsapp: normalizeBrazilianWhatsapp(params.customWhatsapp || tpl.store.whatsapp),
      createdAt: nowTs,
      updatedAt: nowTs,
    };

    batch.set(doc(db, 'stores', storeId), storePayload);

    // Bind admin to store (if first store for this non-bootstrap user, or update for bootstrap)
    const adminRef = doc(db, 'admins', params.ownerUid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      batch.set(adminRef, {
        uid: params.ownerUid,
        email: params.ownerEmail,
        storeId,
        createdAt: nowTs,
        updatedAt: nowTs,
      });
    }

    for (const srv of tpl.services) {
      const { id, ...rest } = srv;
      batch.set(doc(db, 'stores', storeId, 'services', id), {
        ...rest,
        storeId,
        createdAt: nowTs,
        updatedAt: nowTs,
      });
    }

    for (const member of tpl.staff) {
      const { id, ...rest } = member;
      batch.set(doc(db, 'stores', storeId, 'staff', id), {
        ...rest,
        storeId,
        createdAt: nowTs,
        updatedAt: nowTs,
      });
    }

    await batch.commit();

    const createdStore: StoreConfig = {
      ...tpl.store,
      storeId,
      slug: storeId,
      ownerId: params.ownerUid,
      name: (params.customName || tpl.store.name).slice(0, 80),
      whatsapp: normalizeBrazilianWhatsapp(params.customWhatsapp || tpl.store.whatsapp),
      isLiveFirestore: true,
    };

    // Optionally seed 3 realistic appointments for today & tomorrow
    if (params.includeDemoAppointments && tpl.services.length > 0 && tpl.staff.length > 0) {
      const today = new Date();
      const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12, 0, 0);
      const todayIso = toISODateLocal(today);
      const tomorrowIso = toISODateLocal(tomorrow);

      const samples: {
        srvIdx: number;
        staffIdx: number;
        date: string;
        startMinute: number;
        clientName: string;
        clientWhatsapp: string;
        clientNotes: string;
        status: AppointmentStatus;
      }[] = [
        {
          srvIdx: 0,
          staffIdx: 0,
          date: todayIso,
          startMinute: 10 * 60,
          clientName: 'Mariana Alencar',
          clientWhatsapp: '5511988112233',
          clientNotes: 'Prefere atendimento sem pressa. Cliente fiel.',
          status: 'confirmado',
        },
        {
          srvIdx: Math.min(1, tpl.services.length - 1),
          staffIdx: 0,
          date: todayIso,
          startMinute: 14 * 60,
          clientName: 'Henrique Tavares',
          clientWhatsapp: '5511977223344',
          clientNotes: 'Primeira visita, veio por indicação.',
          status: 'agendado',
        },
        {
          srvIdx: Math.min(2, tpl.services.length - 1),
          staffIdx: Math.min(1, tpl.staff.length - 1),
          date: tomorrowIso,
          startMinute: 11 * 60,
          clientName: 'Fernanda Nogueira',
          clientWhatsapp: '5511966334455',
          clientNotes: 'Sinal via Pix enviado.',
          status: 'confirmado',
        },
      ];

      for (const s of samples) {
        try {
          await createBookingAtomic({
            store: createdStore,
            service: { ...tpl.services[s.srvIdx], storeId },
            staff: { ...tpl.staff[s.staffIdx], storeId },
            date: s.date,
            startMinute: s.startMinute,
            clientName: s.clientName,
            clientWhatsapp: s.clientWhatsapp,
            clientNotes: s.clientNotes,
            lgpdConsent: true,
            initialStatus: s.status,
          });
        } catch {
          // ignore if slot already occupied on re-seed
        }
      }
    }

    return createdStore;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, storePath);
  }
}

export async function updateStoreConfig(store: StoreConfig): Promise<void> {
  const path = `stores/${store.storeId}`;
  try {
    const cleanHex = (val: string | undefined, fallback: string) => {
      const trimmed = String(val || '').trim();
      return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
    };
    const cleanSlug =
      String(store.slug || store.storeId || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64) || store.storeId;

    const normalizedWhatsapp = normalizeBrazilianWhatsapp(store.whatsapp || '');
    if (!/^[0-9]{10,15}$/.test(normalizedWhatsapp)) {
      throw new Error('Informe um número de WhatsApp válido com DDD (ex.: (11) 99999-8888).');
    }

    const rawRating = Number(store.rating);
    const sanitizedRating = Number.isFinite(rawRating)
      ? Math.round(Math.min(5, Math.max(0, rawRating)) * 10) / 10
      : 5;
    const rawAttendances = Number(store.totalAttendances);
    const sanitizedAttendances = Number.isFinite(rawAttendances)
      ? Math.min(10000000, Math.max(0, Math.round(rawAttendances)))
      : 0;
    const sanitizedReviews = (store.reviews || []).slice(0, 20).map((rev) => ({
      author: String(rev.author || '').trim().slice(0, 80),
      role: String(rev.role || '').trim().slice(0, 80),
      rating: Math.min(5, Math.max(1, Math.round(Number(rev.rating) || 5))),
      comment: String(rev.comment || '').trim().slice(0, 320),
      date: String(rev.date || '').trim().slice(0, 40),
    }));
    const sanitizedBadges = (store.trustBadges || [])
      .map((b) => String(b || '').trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 10);
    const sanitizedHolidays = (store.holidays || [])
      .map((d) => String(d || '').trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .slice(0, 100);
    const sanitizedBlocked = (store.blockedDates || [])
      .map((d) => String(d || '').trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .slice(0, 200);
    const sanitizedMinAdvance = Math.min(
      43200,
      Math.max(0, Math.round(Number(store.minAdvanceMinutes) || 0))
    );
    const sanitizedSlotInterval = Math.min(
      240,
      Math.max(5, Math.round(Number(store.slotIntervalMinutes) || 30))
    );

    const payload: Record<string, unknown> = {
      name: String(store.name || '').trim().slice(0, 100) || 'Minha Loja',
      slug: cleanSlug.length >= 2 ? cleanSlug : store.storeId,
      segment: store.segment,
      tagline: String(store.tagline || '').trim().slice(0, 200),
      heroTitle: String(store.heroTitle || '').trim().slice(0, 160) || 'Agende online em segundos',
      heroSubtitle: String(store.heroSubtitle || '').trim().slice(0, 400),
      heroImage: String(store.heroImage || '').trim().slice(0, 1000),
      primaryColor: cleanHex(store.primaryColor, '#0f766e'),
      accentColor: cleanHex(store.accentColor, cleanHex(store.primaryColor, '#14b8a6')),
      whatsapp: normalizedWhatsapp,
      address: String(store.address || '').trim().slice(0, 400),
      mapsQuery: String(store.mapsQuery || '').trim().slice(0, 400),
      googleReviewUrl: String(store.googleReviewUrl || '').trim().slice(0, 1000),
      rating: sanitizedRating,
      totalAttendances: sanitizedAttendances,
      showReviews: store.showReviews !== false,
      trustBadges: sanitizedBadges,
      businessHours: store.businessHours,
      holidays: sanitizedHolidays,
      blockedDates: sanitizedBlocked,
      minAdvanceMinutes: sanitizedMinAdvance,
      slotIntervalMinutes: sanitizedSlotInterval,
      cancellationPolicy: String(store.cancellationPolicy || '').trim().slice(0, 1000),
      arrivalInstructions: String(store.arrivalInstructions || '').trim().slice(0, 1000),
      pixKey: String(store.pixKey || '').trim().slice(0, 140),
      pixMerchantName: String(store.pixMerchantName || '').trim().slice(0, 80),
      pixMerchantCity: String(store.pixMerchantCity || '').trim().slice(0, 60),
      messageTemplates: store.messageTemplates,
      faq: (store.faq || []).slice(0, 30),
      reviews: sanitizedReviews,
      onboardingCompleted: Boolean(store.onboardingCompleted),
      dailyReminderTime: String(store.dailyReminderTime || '18:00').trim().slice(0, 5),
      automationWebhookUrl: String(store.automationWebhookUrl || '').trim().slice(0, 1000),
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, 'stores', store.storeId), payload);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Informe um número')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveServiceItem(storeId: string, service: ServiceItem, isNew: boolean): Promise<void> {
  const id = service.id || `srv-${generateSecureToken(10)}`;
  const path = `stores/${storeId}/services/${id}`;
  try {
    const nowTs = serverTimestamp();
    const base = {
      name: String(service.name || '').trim().slice(0, 90) || 'Serviço',
      description: String(service.description || '').trim().slice(0, 400),
      category: String(service.category || 'Geral').trim().slice(0, 60),
      durationMinutes: Math.min(480, Math.max(5, Math.round(Number(service.durationMinutes) || 30))),
      priceCents: Math.min(10000000, Math.max(0, Math.round(Number(service.priceCents) || 0))),
      bufferMinutes: Math.min(120, Math.max(0, Math.round(Number(service.bufferMinutes) || 0))),
      requiresDeposit: Boolean(service.requiresDeposit),
      depositAmountCents: service.requiresDeposit
        ? Math.min(10000000, Math.max(0, Math.round(Number(service.depositAmountCents) || 0)))
        : 0,
      returnDays: Math.min(730, Math.max(0, Math.round(Number(service.returnDays) || 0))),
      active: Boolean(service.active),
      sortOrder: Math.min(1000, Math.max(0, Math.round(Number(service.sortOrder) || 1))),
      updatedAt: nowTs,
    };
    if (isNew) {
      await setDoc(doc(db, 'stores', storeId, 'services', id), {
        ...base,
        storeId,
        createdAt: nowTs,
      });
    } else {
      await updateDoc(doc(db, 'stores', storeId, 'services', id), base);
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteServiceItem(storeId: string, serviceId: string): Promise<void> {
  const path = `stores/${storeId}/services/${serviceId}`;
  try {
    await deleteDoc(doc(db, 'stores', storeId, 'services', serviceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveStaffMember(storeId: string, member: StaffMember, isNew: boolean): Promise<void> {
  const id = member.id || `prof-${generateSecureToken(10)}`;
  const path = `stores/${storeId}/staff/${id}`;
  try {
    const nowTs = serverTimestamp();
    const base = {
      name: String(member.name || '').trim().slice(0, 80) || 'Profissional',
      role: String(member.role || 'Profissional').trim().slice(0, 80) || 'Profissional',
      specialty: String(member.specialty || '').trim().slice(0, 160),
      bio: String(member.bio || '').trim().slice(0, 500),
      avatarUrl: String(member.avatarUrl || '').trim().slice(0, 1000),
      serviceIds: (member.serviceIds || []).slice(0, 100),
      schedule: member.schedule,
      daysOff: (member.daysOff || [])
        .map((d) => String(d || '').trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .slice(0, 200),
      active: Boolean(member.active),
      updatedAt: nowTs,
    };
    if (isNew) {
      await setDoc(doc(db, 'stores', storeId, 'staff', id), {
        ...base,
        storeId,
        createdAt: nowTs,
      });
    } else {
      await updateDoc(doc(db, 'stores', storeId, 'staff', id), base);
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteStaffMember(storeId: string, staffId: string): Promise<void> {
  const path = `stores/${storeId}/staff/${staffId}`;
  try {
    await deleteDoc(doc(db, 'stores', storeId, 'staff', staffId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminUpdateAppointmentStatus(
  storeId: string,
  appointment: AppointmentRecord,
  newStatus: AppointmentStatus,
  store?: StoreConfig
): Promise<void> {
  const path = `stores/${storeId}/appointments/${appointment.id}`;
  try {
    await runTransaction(db, async (tx) => {
      const nowTs = serverTimestamp();
      const apptRef = doc(db, 'stores', storeId, 'appointments', appointment.id);
      const tokenRef = doc(db, 'stores', storeId, 'bookingTokens', appointment.manageToken);
      const slotLockRefs =
        newStatus === 'cancelado'
          ? (appointment.blockLockIds || []).map((lid) => doc(db, 'stores', storeId, 'slotLocks', lid))
          : [];
      const clientLockRefs =
        newStatus === 'cancelado'
          ? (appointment.clientBlockLockIds || []).map((cid) =>
              doc(db, 'stores', storeId, 'clientLocks', cid)
            )
          : [];

      const [tokenSnap, slotLockSnaps, clientLockSnaps] = await Promise.all([
        tx.get(tokenRef),
        Promise.all(slotLockRefs.map((ref) => tx.get(ref))),
        Promise.all(clientLockRefs.map((ref) => tx.get(ref))),
      ]);

      tx.update(apptRef, { status: newStatus, updatedAt: nowTs });
      if (tokenSnap.exists()) {
        tx.update(tokenRef, { status: newStatus, updatedAt: nowTs });
      }

      // If cancelled, immediately release existing slotLocks and clientLocks back to calendar
      if (newStatus === 'cancelado') {
        slotLockRefs.forEach((lockRef, idx) => {
          if (slotLockSnaps[idx].exists()) {
            tx.update(lockRef, {
              status: 'released',
              releaseToken: appointment.manageToken,
              updatedAt: nowTs,
            });
          }
        });
        clientLockRefs.forEach((cLockRef, idx) => {
          if (clientLockSnaps[idx].exists()) {
            tx.update(cLockRef, {
              status: 'released',
              releaseToken: appointment.manageToken,
              updatedAt: nowTs,
            });
          }
        });
      }
    });

    if (newStatus === 'cancelado' && store) {
      dispatchAutomationWebhook(store, 'cancelamento', {
        appointmentId: appointment.id,
        cliente: appointment.clientName,
        whatsapp: appointment.clientWhatsapp,
        servico: appointment.serviceName,
        profissional: appointment.staffName,
        data: appointment.date,
        hora: minutesToTime(appointment.startMinute),
        status: 'cancelado',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminRecordReminderSent(
  storeId: string,
  appointmentId: string
): Promise<string> {
  const path = `stores/${storeId}/appointments/${appointmentId}`;
  const sentAtIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'stores', storeId, 'appointments', appointmentId), {
      reminderSentAt: sentAtIso,
      updatedAt: serverTimestamp(),
    });
    return sentAtIso;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminUpdateReminderResponse(
  storeId: string,
  appointment: AppointmentRecord,
  response: ReminderResponse
): Promise<void> {
  const path = `stores/${storeId}/appointments/${appointment.id}`;
  try {
    await runTransaction(db, async (tx) => {
      const nowTs = serverTimestamp();
      const apptRef = doc(db, 'stores', storeId, 'appointments', appointment.id);
      const tokenRef = doc(db, 'stores', storeId, 'bookingTokens', appointment.manageToken);
      const tokenSnap = await tx.get(tokenRef);

      const apptUpdate: Record<string, unknown> = {
        reminderResponse: response,
        updatedAt: nowTs,
      };
      if (response === 'confirmou' && appointment.status === 'agendado') {
        apptUpdate.status = 'confirmado';
      }
      tx.update(apptRef, apptUpdate);

      if (response === 'confirmou' && appointment.status === 'agendado' && tokenSnap.exists()) {
        tx.update(tokenRef, { status: 'confirmado', updatedAt: nowTs });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminUpdateAppointmentNotes(
  storeId: string,
  appointmentId: string,
  clientNotes: string
): Promise<void> {
  const path = `stores/${storeId}/appointments/${appointmentId}`;
  try {
    await updateDoc(doc(db, 'stores', storeId, 'appointments', appointmentId), {
      clientNotes: clientNotes.slice(0, 400),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminRescheduleAppointment(params: {
  storeId: string;
  store?: StoreConfig;
  appointment: AppointmentRecord;
  newStaff: StaffMember;
  newDate: string;
  newStartMinute: number;
  bufferMinutes?: number;
}): Promise<void> {
  const { storeId, store, appointment, newStaff, newDate, newStartMinute, bufferMinutes = 0 } = params;
  const newEndMinute = newStartMinute + appointment.durationMinutes + bufferMinutes;
  const newLockIds = buildBlockLockIds(newStaff.id, newDate, newStartMinute, newEndMinute);
  const clientPhoneHash = await hashClientPhone(appointment.clientWhatsapp);
  const newClientLockIds = buildClientBlockLockIds(clientPhoneHash, newDate, newStartMinute, newEndMinute);
  const oldClientLockIds = appointment.clientBlockLockIds || [];
  const path = `stores/${storeId}/appointments/${appointment.id}`;

  try {
    await runTransaction(db, async (tx) => {
      const newLockRefs = newLockIds.map((lid) => doc(db, 'stores', storeId, 'slotLocks', lid));
      const newClientLockRefs = newClientLockIds.map((cid) => doc(db, 'stores', storeId, 'clientLocks', cid));
      const oldLockIdsToRelease = (appointment.blockLockIds || []).filter((oldId) => !newLockIds.includes(oldId));
      const oldClientIdsToRelease = oldClientLockIds.filter((oldCid) => !newClientLockIds.includes(oldCid));
      const oldLockRefs = oldLockIdsToRelease.map((oldId) => doc(db, 'stores', storeId, 'slotLocks', oldId));
      const oldClientLockRefs = oldClientIdsToRelease.map((oldCid) =>
        doc(db, 'stores', storeId, 'clientLocks', oldCid)
      );
      const tokenRef = doc(db, 'stores', storeId, 'bookingTokens', appointment.manageToken);

      const [newLockSnaps, newClientLockSnaps, oldLockSnaps, oldClientLockSnaps, tokenSnap] =
        await Promise.all([
          Promise.all(newLockRefs.map((ref) => tx.get(ref))),
          Promise.all(newClientLockRefs.map((ref) => tx.get(ref))),
          Promise.all(oldLockRefs.map((ref) => tx.get(ref))),
          Promise.all(oldClientLockRefs.map((ref) => tx.get(ref))),
          tx.get(tokenRef),
        ]);

      for (const snap of newClientLockSnaps) {
        if (
          snap.exists() &&
          snap.data()?.status === 'active' &&
          snap.data()?.appointmentId !== appointment.id
        ) {
          throw new Error('CLIENT_CONFLICT');
        }
      }

      for (const snap of newLockSnaps) {
        if (
          snap.exists() &&
          snap.data()?.status === 'active' &&
          snap.data()?.appointmentId !== appointment.id
        ) {
          throw new Error('SLOT_CONFLICT');
        }
      }

      const nowTs = serverTimestamp();

      oldLockRefs.forEach((ref, idx) => {
        if (oldLockSnaps[idx].exists()) {
          tx.update(ref, {
            status: 'released',
            releaseToken: appointment.manageToken,
            updatedAt: nowTs,
          });
        }
      });

      oldClientLockRefs.forEach((ref, idx) => {
        if (oldClientLockSnaps[idx].exists()) {
          tx.update(ref, {
            status: 'released',
            releaseToken: appointment.manageToken,
            updatedAt: nowTs,
          });
        }
      });

      newLockRefs.forEach((ref, idx) => {
        const blockMinute =
          Math.floor(newStartMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES;
        if (newLockSnaps[idx].exists()) {
          tx.update(ref, {
            appointmentId: appointment.id,
            manageToken: appointment.manageToken,
            releaseToken: '',
            startMinute: newStartMinute,
            endMinute: newEndMinute,
            status: 'active',
            updatedAt: nowTs,
          });
        } else {
          tx.set(ref, {
            storeId,
            staffId: newStaff.id,
            date: newDate,
            blockMinute,
            startMinute: newStartMinute,
            endMinute: newEndMinute,
            appointmentId: appointment.id,
            manageToken: appointment.manageToken,
            releaseToken: '',
            status: 'active',
            createdAt: nowTs,
            updatedAt: nowTs,
          });
        }
      });

      newClientLockRefs.forEach((ref, idx) => {
        const blockMinute =
          Math.floor(newStartMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES + idx * BLOCK_SIZE_MINUTES;
        if (newClientLockSnaps[idx].exists()) {
          tx.update(ref, {
            appointmentId: appointment.id,
            manageToken: appointment.manageToken,
            releaseToken: '',
            status: 'active',
            updatedAt: nowTs,
          });
        } else {
          tx.set(ref, {
            storeId,
            clientHash: clientPhoneHash,
            date: newDate,
            blockMinute,
            appointmentId: appointment.id,
            manageToken: appointment.manageToken,
            releaseToken: '',
            status: 'active',
            createdAt: nowTs,
            updatedAt: nowTs,
          });
        }
      });

      const nextStatus = appointment.status === 'cancelado' ? 'agendado' : appointment.status;
      const updateFields = {
        date: newDate,
        startMinute: newStartMinute,
        endMinute: newEndMinute,
        staffId: newStaff.id,
        staffName: newStaff.name.slice(0, 80),
        blockLockIds: newLockIds,
        clientBlockLockIds: newClientLockIds,
        status: nextStatus,
        updatedAt: nowTs,
      };

      tx.update(doc(db, 'stores', storeId, 'appointments', appointment.id), updateFields);
      if (tokenSnap.exists()) {
        tx.update(tokenRef, updateFields);
      }
    });

    if (store) {
      dispatchAutomationWebhook(store, 'remarcacao', {
        appointmentId: appointment.id,
        cliente: appointment.clientName,
        whatsapp: appointment.clientWhatsapp,
        servico: appointment.serviceName,
        profissional: newStaff.name,
        data: newDate,
        hora: minutesToTime(newStartMinute),
        status: appointment.status === 'cancelado' ? 'agendado' : appointment.status,
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'CLIENT_CONFLICT') {
      throw new Error('Este cliente já possui outro agendamento no mesmo dia e horário.');
    }
    if (error instanceof Error && error.message === 'SLOT_CONFLICT') {
      throw new Error('Já existe outro agendamento neste horário para o profissional selecionado.');
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminUpdateWaitlistStatus(
  storeId: string,
  entryId: string,
  status: WaitlistStatus
): Promise<void> {
  const path = `stores/${storeId}/waitlist/${entryId}`;
  try {
    await updateDoc(doc(db, 'stores', storeId, 'waitlist', entryId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Subscribes in real time to a store's collections for the authenticated Admin panel.
 */
export function subscribeAdminStore(params: {
  storeId: string;
  ownerUid: string;
  onStore: (store: StoreConfig) => void;
  onServices: (services: ServiceItem[]) => void;
  onStaff: (staff: StaffMember[]) => void;
  onAppointments: (appts: AppointmentRecord[]) => void;
  onSlotLocks: (locks: SlotLockRecord[]) => void;
  onWaitlist: (entries: WaitlistRecord[]) => void;
  onError: (err: Error) => void;
}): () => void {
  const { storeId, ownerUid } = params;

  const unsubs: (() => void)[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'stores', storeId),
      (snap) => {
        if (snap.exists()) {
          params.onStore({ ...(snap.data() as StoreConfig), storeId: snap.id, isLiveFirestore: true });
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `stores/${storeId}`);
        } catch (wrapped) {
          params.onError(wrapped as Error);
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'stores', storeId, 'services'), where('storeId', '==', storeId)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Omit<ServiceItem, 'id'>), id: d.id }))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        params.onServices(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `stores/${storeId}/services`);
        } catch (wrapped) {
          params.onError(wrapped as Error);
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'stores', storeId, 'staff'), where('storeId', '==', storeId)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<StaffMember, 'id'>), id: d.id }));
        params.onStaff(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `stores/${storeId}/staff`);
        } catch (wrapped) {
          params.onError(wrapped as Error);
        }
      }
    )
  );

  const apptQuery = query(
    collection(db, 'stores', storeId, 'appointments'),
    where('storeId', '==', storeId)
  );

  unsubs.push(
    onSnapshot(
      apptQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Omit<AppointmentRecord, 'id'>), id: d.id }))
          .sort((a, b) => (a.date === b.date ? a.startMinute - b.startMinute : a.date.localeCompare(b.date)));
        params.onAppointments(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `stores/${storeId}/appointments`);
        } catch (wrapped) {
          params.onError(wrapped as Error);
        }
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'stores', storeId, 'slotLocks'), where('storeId', '==', storeId)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as Omit<SlotLockRecord, 'id'>), id: d.id }))
          .filter((l) => l.status === 'active');
        params.onSlotLocks(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `stores/${storeId}/slotLocks`);
        } catch (wrapped) {
          params.onError(wrapped as Error);
        }
      }
    )
  );

  const waitlistQuery = query(
    collection(db, 'stores', storeId, 'waitlist'),
    where('storeId', '==', storeId)
  );

  unsubs.push(
    onSnapshot(
      waitlistQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<WaitlistRecord, 'id'>), id: d.id }));
        params.onWaitlist(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `stores/${storeId}/waitlist`);
        } catch (wrapped) {
          params.onError(wrapped as Error);
        }
      }
    )
  );

  return () => {
    unsubs.forEach((fn) => fn());
  };
}
