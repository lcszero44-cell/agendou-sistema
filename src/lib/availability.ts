import {
  ComputedTimeSlot,
  ServiceItem,
  SlotLockRecord,
  StaffMember,
  StoreConfig,
} from '../types/booking';
import {
  BLOCK_SIZE_MINUTES,
  minutesToTime,
  parseISODateLocal,
  timeToMinutes,
  toISODateLocal,
} from './brUtils';

export function buildBlockLockIds(
  staffId: string,
  date: string,
  startMinute: number,
  endMinute: number
): string[] {
  const ids: string[] = [];
  const alignedStart = Math.floor(startMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES;
  for (let m = alignedStart; m < endMinute; m += BLOCK_SIZE_MINUTES) {
    ids.push(`${staffId}_${date}_${m}`);
  }
  return ids;
}

export function buildClientBlockLockIds(
  clientPhoneHash: string,
  date: string,
  startMinute: number,
  endMinute: number
): string[] {
  const ids: string[] = [];
  const alignedStart = Math.floor(startMinute / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES;
  for (let m = alignedStart; m < endMinute; m += BLOCK_SIZE_MINUTES) {
    ids.push(`c_${clientPhoneHash}_${date}_${m}`);
  }
  return ids;
}

export function getPeriodFromMinute(minute: number): 'manha' | 'tarde' | 'noite' {
  if (minute < 12 * 60) return 'manha';
  if (minute < 18 * 60) return 'tarde';
  return 'noite';
}

export function getEligibleStaff(staffList: StaffMember[], serviceId: string): StaffMember[] {
  return staffList.filter(
    (member) =>
      member.active &&
      (member.serviceIds.length === 0 || member.serviceIds.includes(serviceId))
  );
}

/**
 * Computes genuinely free time slots for a date, service, and optional staff member.
 * Strictly honors store hours, holidays, blocked dates, staff hours, breaks, days off,
 * service duration + buffer, minAdvanceMinutes, and active slotLocks.
 */
export function computeAvailableSlots(params: {
  store: StoreConfig;
  service: ServiceItem;
  staffList: StaffMember[];
  selectedStaffId: string | 'any';
  date: string; // YYYY-MM-DD
  activeLocks: SlotLockRecord[];
  ignoreAppointmentId?: string;
  now?: Date;
}): ComputedTimeSlot[] {
  const {
    store,
    service,
    staffList,
    selectedStaffId,
    date,
    activeLocks,
    ignoreAppointmentId,
    now = new Date(),
  } = params;

  if (store.holidays.includes(date) || store.blockedDates.includes(date)) {
    return [];
  }

  const targetDate = parseISODateLocal(date);
  const dayKey = String(targetDate.getDay());
  const storeDay = store.businessHours[dayKey];
  if (!storeDay || !storeDay.enabled) {
    return [];
  }

  const todayIso = toISODateLocal(now);
  if (date < todayIso) {
    return [];
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const minAllowedStartToday = nowMinutes + (store.minAdvanceMinutes || 0);

  const eligible = getEligibleStaff(staffList, service.id).filter(
    (s) => selectedStaffId === 'any' || s.id === selectedStaffId
  );

  if (eligible.length === 0) return [];

  // Index busy blocks by staffId for O(1) conflict checks
  const busyByStaff = new Map<string, Set<number>>();
  for (const lock of activeLocks) {
    if (lock.status !== 'active' || lock.date !== date) continue;
    if (ignoreAppointmentId && lock.appointmentId === ignoreAppointmentId) continue;
    let set = busyByStaff.get(lock.staffId);
    if (!set) {
      set = new Set<number>();
      busyByStaff.set(lock.staffId, set);
    }
    set.add(lock.blockMinute);
  }

  const storeOpen = timeToMinutes(storeDay.open);
  const storeClose = timeToMinutes(storeDay.close);
  const storeBreakStart = storeDay.breakStart ? timeToMinutes(storeDay.breakStart) : null;
  const storeBreakEnd = storeDay.breakEnd ? timeToMinutes(storeDay.breakEnd) : null;

  const totalDuration = service.durationMinutes + (service.bufferMinutes || 0);
  const step = Math.max(BLOCK_SIZE_MINUTES, store.slotIntervalMinutes || 30);

  const slots: ComputedTimeSlot[] = [];

  for (let start = storeOpen; start + service.durationMinutes <= storeClose; start += step) {
    if (date === todayIso && start < minAllowedStartToday) {
      continue;
    }

    const end = start + totalDuration;
    const serviceEnd = start + service.durationMinutes;
    if (serviceEnd > storeClose) continue;

    // Check store lunch break overlap
    if (
      storeBreakStart !== null &&
      storeBreakEnd !== null &&
      start < storeBreakEnd &&
      serviceEnd > storeBreakStart
    ) {
      continue;
    }

    const availableStaffIds: string[] = [];

    for (const member of eligible) {
      if (member.daysOff.includes(date)) continue;
      const memberDay = member.schedule[dayKey];
      if (!memberDay || !memberDay.enabled) continue;

      const mOpen = timeToMinutes(memberDay.open);
      const mClose = timeToMinutes(memberDay.close);
      if (start < mOpen || serviceEnd > mClose) continue;

      if (memberDay.breakStart && memberDay.breakEnd) {
        const mbStart = timeToMinutes(memberDay.breakStart);
        const mbEnd = timeToMinutes(memberDay.breakEnd);
        if (start < mbEnd && serviceEnd > mbStart) continue;
      }

      const busyBlocks = busyByStaff.get(member.id);
      let hasConflict = false;
      const alignedStart = Math.floor(start / BLOCK_SIZE_MINUTES) * BLOCK_SIZE_MINUTES;
      for (let m = alignedStart; m < end; m += BLOCK_SIZE_MINUTES) {
        if (busyBlocks && busyBlocks.has(m)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        availableStaffIds.push(member.id);
      }
    }

    if (availableStaffIds.length > 0) {
      slots.push({
        startMinute: start,
        endMinute: end,
        label: minutesToTime(start),
        availableStaffIds,
        remainingSpots: availableStaffIds.length,
        period: getPeriodFromMinute(start),
      });
    }
  }

  return slots;
}

export function getNextDays(count = 14, fromDate = new Date()): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i, 12, 0, 0);
    days.push(toISODateLocal(d));
  }
  return days;
}

export function findNextAvailableSlot(params: {
  store: StoreConfig;
  service: ServiceItem;
  staffList: StaffMember[];
  selectedStaffId: string | 'any';
  activeLocks: SlotLockRecord[];
  daysAhead?: number;
  now?: Date;
}): { date: string; slot: ComputedTimeSlot } | null {
  const days = getNextDays(params.daysAhead ?? 14, params.now);
  for (const date of days) {
    const slots = computeAvailableSlots({
      store: params.store,
      service: params.service,
      staffList: params.staffList,
      selectedStaffId: params.selectedStaffId,
      date,
      activeLocks: params.activeLocks,
      now: params.now,
    });
    if (slots.length > 0) {
      return { date, slot: slots[0] };
    }
  }
  return null;
}

/**
 * Finds empty schedule gaps ("buracos na agenda") for the Admin day view
 * so the owner can fill idle slots or contact waitlist clients.
 */
export function findScheduleGaps(params: {
  store: StoreConfig;
  staff: StaffMember;
  date: string;
  activeLocks: SlotLockRecord[];
  minGapMinutes?: number;
}): { startMinute: number; endMinute: number; durationMinutes: number }[] {
  const { store, staff, date, activeLocks, minGapMinutes = 45 } = params;
  if (store.holidays.includes(date) || store.blockedDates.includes(date) || staff.daysOff.includes(date)) {
    return [];
  }
  const dayKey = String(parseISODateLocal(date).getDay());
  const day = staff.schedule[dayKey];
  if (!day || !day.enabled) return [];

  const open = timeToMinutes(day.open);
  const close = timeToMinutes(day.close);
  const bStart = day.breakStart ? timeToMinutes(day.breakStart) : null;
  const bEnd = day.breakEnd ? timeToMinutes(day.breakEnd) : null;

  const busy = new Set<number>();
  for (const l of activeLocks) {
    if (l.status === 'active' && l.date === date && l.staffId === staff.id) {
      busy.add(l.blockMinute);
    }
  }

  const gaps: { startMinute: number; endMinute: number; durationMinutes: number }[] = [];
  let gapStart: number | null = null;

  for (let m = open; m < close; m += BLOCK_SIZE_MINUTES) {
    const isBreak = bStart !== null && bEnd !== null && m >= bStart && m < bEnd;
    const isBusy = busy.has(m) || isBreak;

    if (!isBusy && gapStart === null) {
      gapStart = m;
    } else if (isBusy && gapStart !== null) {
      const dur = m - gapStart;
      if (dur >= minGapMinutes) {
        gaps.push({ startMinute: gapStart, endMinute: m, durationMinutes: dur });
      }
      gapStart = null;
    }
  }

  if (gapStart !== null) {
    const dur = close - gapStart;
    if (dur >= minGapMinutes) {
      gaps.push({ startMinute: gapStart, endMinute: close, durationMinutes: dur });
    }
  }

  return gaps;
}
