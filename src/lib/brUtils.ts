import { AppointmentStatus, StoreConfig } from '../types/booking';

export const BLOCK_SIZE_MINUTES = 15;

export function generateSecureToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[array[i] % chars.length];
  }
  return out;
}

export function formatCurrencyBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents || 0) / 100);
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '09:00').split(':');
  const h = parseInt(hStr || '0', 10);
  const m = parseInt(mStr || '0', 10);
  return h * 60 + m;
}

export function toISODateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODateLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function formatDateBR(isoDate: string, style: 'short' | 'long' | 'weekday' = 'short'): string {
  const date = parseISODateLocal(isoDate);
  if (style === 'short') {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (style === 'weekday') {
    return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');
  }
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

export function getDayLabelShort(dayIndex: number): string {
  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return labels[dayIndex] || '';
}

export function getDayLabelFull(dayIndex: number): string {
  const labels = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return labels[dayIndex] || '';
}

export function getWeekdayNameFromIso(isoDate: string): string {
  const date = parseISODateLocal(isoDate);
  const labels = [
    'domingo',
    'segunda-feira',
    'terça-feira',
    'quarta-feira',
    'quinta-feira',
    'sexta-feira',
    'sábado',
  ];
  return labels[date.getDay()] || '';
}

export function formatDateTimeBR(isoTimestamp?: string): string {
  if (!isoTimestamp) return '';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  const d = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const t = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${d} às ${t}`;
}

export async function hashClientPhone(normalizedWhatsapp: string): Promise<string> {
  const clean = onlyDigits(normalizedWhatsapp);
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const data = new TextEncoder().encode(`agendou-phone:${clean}`);
      const digest = await crypto.subtle.digest('SHA-256', data);
      const bytes = Array.from(new Uint8Array(digest));
      return bytes
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 24);
    } catch {
      // Fallback below
    }
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}${(
    (h1 ^ h2) >>>
    0
  )
    .toString(16)
    .padStart(8, '0')}`.slice(0, 24);
}

// --- Brazilian Phone Validation & Formatting ---

export function onlyDigits(val: string): string {
  return (val || '').replace(/\D/g, '');
}

export function formatBrazilianPhoneInput(raw: string): string {
  let digits = onlyDigits(raw);
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function normalizeBrazilianWhatsapp(raw: string): string {
  const digits = onlyDigits(raw);
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  return digits;
}

export function isValidBrazilianPhone(raw: string): boolean {
  let digits = onlyDigits(raw);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  if (digits.length === 11 && digits[2] !== '9') return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

// --- Pix Copia e Cola (EMVCo BR Code with CRC16-CCITT 0x1021) ---

function emvField(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function sanitizePixText(text: string, maxLen: number): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .\-]/g, '')
    .trim()
    .slice(0, maxLen)
    .toUpperCase();
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generatePixBrCode(params: {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid?: string;
}): string {
  const key = (params.pixKey || '').trim();
  if (!key) return '';

  const name = sanitizePixText(params.merchantName || 'AGENDAMENTO', 25) || 'ESTABELECIMENTO';
  const city = sanitizePixText(params.merchantCity || 'SAO PAULO', 15) || 'SAO PAULO';
  const cleanTxid = (params.txid || 'AGEND01').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'AGEND01';

  const merchantAccount =
    emvField('00', 'br.gov.bcb.pix') +
    emvField('01', key);

  let payload =
    emvField('00', '01') +
    emvField('26', merchantAccount) +
    emvField('52', '0000') +
    emvField('53', '986');

  if (params.amountCents > 0) {
    payload += emvField('54', (params.amountCents / 100).toFixed(2));
  }

  payload +=
    emvField('58', 'BR') +
    emvField('59', name) +
    emvField('60', city) +
    emvField('62', emvField('05', cleanTxid)) +
    '6304';

  const crc = crc16Ccitt(payload);
  return `${payload}${crc}`;
}

// --- WhatsApp Link & Template Interpolation ---

export function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  const nome = vars.nome ?? vars.cliente ?? '';
  const servico = vars['serviço'] ?? vars.servico ?? '';
  const profissional = vars.profissional ?? '';
  const data = vars.data ?? '';
  const hora = vars.hora ?? '';
  const loja = vars.loja ?? '';
  const link = vars.link ?? '';
  const googleReview = vars.googleReview ?? '';
  const diaDaSemana = vars['dia da semana'] ?? vars.diaDaSemana ?? '';

  const normalizedMap: Record<string, string> = {
    ...vars,
    nome,
    cliente: nome,
    servico,
    'serviço': servico,
    profissional,
    data,
    hora,
    loja,
    link,
    googleReview,
    googlereview: googleReview,
    diaDaSemana,
    'dia da semana': diaDaSemana,
  };

  return template
    .replace(/\[([^\]]+)\]/g, (match, rawKey: string) => {
      const k = rawKey.trim();
      if (k in normalizedMap) return normalizedMap[k];
      const lower = k.toLowerCase();
      if (lower in normalizedMap) return normalizedMap[lower];
      return match;
    })
    .replace(/\{([^}]+)\}/g, (match, rawKey: string) => {
      const k = rawKey.trim();
      if (k in normalizedMap) return normalizedMap[k];
      const lower = k.toLowerCase();
      if (lower in normalizedMap) return normalizedMap[lower];
      return match;
    });
}

export function buildWhatsappUrl(phoneDigits: string, message: string): string {
  const normalized = normalizeBrazilianWhatsapp(phoneDigits);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildManageBookingUrl(storeId: string, token: string): string {
  if (typeof window === 'undefined') return `?loja=${storeId}&reserva=${token}`;
  const url = new URL(window.location.href);
  url.search = `?loja=${encodeURIComponent(storeId)}&reserva=${encodeURIComponent(token)}`;
  return url.toString();
}

export function buildStorePublicUrl(storeId: string): string {
  if (typeof window === 'undefined') return `?loja=${storeId}`;
  const url = new URL(window.location.href);
  url.search = `?loja=${encodeURIComponent(storeId)}`;
  return url.toString();
}

export function buildAdminRemindersUrl(storeId?: string): string {
  if (typeof window === 'undefined') {
    return storeId ? `?painel=admin&loja=${storeId}&aba=lembretes` : '?painel=admin&aba=lembretes';
  }
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  params.set('painel', 'admin');
  if (storeId) params.set('loja', storeId);
  params.set('aba', 'lembretes');
  url.search = `?${params.toString()}`;
  return url.toString();
}

// --- Calendar Exports (Google Calendar & .ics for Apple/Outlook with VALARM) ---

function formatCalendarUTC(isoDate: string, totalMinutes: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const min = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(min)}00`;
}

export function buildGoogleCalendarUrl(params: {
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  details: string;
  location: string;
}): string {
  const start = formatCalendarUTC(params.date, params.startMinute);
  const end = formatCalendarUTC(params.date, params.endMinute);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${start}/${end}`,
    details: params.details,
    location: params.location,
    ctz: 'America/Sao_Paulo',
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function downloadIcsFile(params: {
  uid: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  details: string;
  location: string;
  alarmMinutesBefore?: number;
  alarmText?: string;
  recurrenceRule?: string;
  fileName?: string;
}): void {
  const start = formatCalendarUTC(params.date, params.startMinute);
  const end = formatCalendarUTC(params.date, params.endMinute);
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const escapeIcs = (s: string) =>
    (s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

  const triggerMinutes = params.alarmMinutesBefore ?? 0;
  const triggerValue = triggerMinutes > 0 ? `-PT${triggerMinutes}M` : 'PT0M';
  const alarmDescription = params.alarmText || 'Hora de avisar seus clientes';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Agendou//Agendamento Online//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${params.uid}@agendou.app`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=America/Sao_Paulo:${start}`,
    `DTEND;TZID=America/Sao_Paulo:${end}`,
    ...(params.recurrenceRule ? [`RRULE:${params.recurrenceRule}`] : []),
    `SUMMARY:${escapeIcs(params.title)}`,
    `DESCRIPTION:${escapeIcs(params.details)}`,
    ...(params.location ? [`LOCATION:${escapeIcs(params.location)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:${triggerValue}`,
    `DESCRIPTION:${escapeIcs(alarmDescription)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = params.fileName || `agendamento-${params.date}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDailyOwnerReminderIcs(params: {
  storeId: string;
  storeName: string;
  timeHHMM: string;
}): void {
  const startMinute = timeToMinutes(params.timeHHMM || '18:00');
  const endMinute = Math.min(23 * 60 + 55, startMinute + 15);
  const todayIso = toISODateLocal(new Date());
  const adminUrl = buildAdminRemindersUrl(params.storeId);

  downloadIcsFile({
    uid: `lembrete-diario-${params.storeId}`,
    title: 'Avisar os clientes de amanhã',
    date: todayIso,
    startMinute,
    endMinute,
    details: `Hora de avisar os clientes de amanhã na ${params.storeName}.\n\nAbra direto a fila de lembretes no painel:\n${adminUrl}`,
    location: params.storeName,
    alarmMinutesBefore: 0,
    alarmText: 'Hora de avisar seus clientes',
    recurrenceRule: 'FREQ=DAILY',
    fileName: `lembrete-diario-${params.storeId}.ics`,
  });
}

export function computeReminderDateTime(params: {
  appointmentDate: string;
  appointmentStartMinute: number;
  mode: '24h' | '2h' | 'custom';
  customDate?: string;
  customTime?: string;
}): { date: string; startMinute: number } {
  if (params.mode === 'custom' && params.customDate && params.customTime) {
    return {
      date: params.customDate,
      startMinute: timeToMinutes(params.customTime),
    };
  }
  const base = parseISODateLocal(params.appointmentDate);
  const hours = Math.floor(params.appointmentStartMinute / 60);
  const mins = params.appointmentStartMinute % 60;
  base.setHours(hours, mins, 0, 0);
  const offsetMs = params.mode === '24h' ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  const reminderDate = new Date(base.getTime() - offsetMs);
  return {
    date: toISODateLocal(reminderDate),
    startMinute: reminderDate.getHours() * 60 + reminderDate.getMinutes(),
  };
}

export function downloadIndividualReminderIcs(params: {
  appointmentId: string;
  clientName: string;
  clientWhatsapp: string;
  serviceName: string;
  appointmentDate: string;
  appointmentStartMinute: number;
  reminderDate: string;
  reminderStartMinute: number;
  readyMessage: string;
  storeName: string;
}): void {
  const dateBR = formatDateBR(params.appointmentDate, 'short');
  const timeLabel = minutesToTime(params.appointmentStartMinute);
  const formattedPhone = formatBrazilianPhoneInput(params.clientWhatsapp);
  const waUrl = buildWhatsappUrl(params.clientWhatsapp, params.readyMessage);
  const title = `Avisar ${params.clientName}: ${params.serviceName} em ${dateBR} às ${timeLabel}`;
  const details = [
    `WhatsApp do cliente: ${formattedPhone}`,
    `Abrir WhatsApp direto: ${waUrl}`,
    '',
    'Mensagem pronta para copiar:',
    params.readyMessage,
  ].join('\n');

  downloadIcsFile({
    uid: `avisar-${params.appointmentId}-${params.reminderDate}-${params.reminderStartMinute}`,
    title,
    date: params.reminderDate,
    startMinute: params.reminderStartMinute,
    endMinute: Math.min(23 * 60 + 55, params.reminderStartMinute + 15),
    details,
    location: params.storeName,
    alarmMinutesBefore: 0,
    alarmText: 'Hora de avisar seus clientes',
    fileName: `avisar-${params.appointmentDate}-${params.clientName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'cliente'}.ics`,
  });
}

export function buildIndividualReminderGoogleCalUrl(params: {
  clientName: string;
  clientWhatsapp: string;
  serviceName: string;
  appointmentDate: string;
  appointmentStartMinute: number;
  reminderDate: string;
  reminderStartMinute: number;
  readyMessage: string;
  storeName: string;
}): string {
  const dateBR = formatDateBR(params.appointmentDate, 'short');
  const timeLabel = minutesToTime(params.appointmentStartMinute);
  const formattedPhone = formatBrazilianPhoneInput(params.clientWhatsapp);
  const waUrl = buildWhatsappUrl(params.clientWhatsapp, params.readyMessage);
  const title = `Avisar ${params.clientName}: ${params.serviceName} em ${dateBR} às ${timeLabel}`;
  const details = [
    `WhatsApp do cliente: ${formattedPhone}`,
    `Abrir WhatsApp direto: ${waUrl}`,
    '',
    'Mensagem pronta para copiar:',
    params.readyMessage,
  ].join('\n');

  return buildGoogleCalendarUrl({
    title,
    date: params.reminderDate,
    startMinute: params.reminderStartMinute,
    endMinute: Math.min(23 * 60 + 55, params.reminderStartMinute + 15),
    details,
    location: params.storeName,
  });
}

// --- Optional Automation Webhook (n8n, Make, Zapier, etc.) ---

export type AutomationWebhookEvent = 'novo_agendamento' | 'cancelamento' | 'remarcacao';

export function dispatchAutomationWebhook(
  store: StoreConfig | undefined,
  evento: AutomationWebhookEvent,
  data: {
    appointmentId: string;
    cliente: string;
    whatsapp: string;
    servico: string;
    profissional: string;
    data: string;
    hora: string;
    status: string;
  }
): void {
  const rawUrl = store?.automationWebhookUrl?.trim();
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return;

  const payload = {
    evento,
    storeId: store?.storeId || '',
    loja: store?.name || '',
    appointmentId: data.appointmentId,
    cliente: data.cliente,
    whatsapp: data.whatsapp,
    servico: data.servico,
    profissional: data.profissional,
    data: data.data,
    hora: data.hora,
    status: data.status,
    timestamp: new Date().toISOString(),
  };

  try {
    void fetch(rawUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Non-blocking: ignore CORS or offline webhook errors
    });
  } catch {
    // Ignore invalid URL or network errors
  }
}

// --- Status Metadata (Always color + explicit label for accessibility) ---

export const STATUS_META: Record<
  AppointmentStatus,
  { label: string; colorClasses: string; dotColor: string }
> = {
  agendado: {
    label: 'Agendado',
    colorClasses: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/60',
    dotColor: '#0284c7',
  },
  confirmado: {
    label: 'Confirmado',
    colorClasses: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60',
    dotColor: '#059669',
  },
  em_atendimento: {
    label: 'Em atendimento',
    colorClasses: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60',
    dotColor: '#d97706',
  },
  concluido: {
    label: 'Concluído',
    colorClasses: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800/80 dark:text-stone-300 dark:border-stone-700',
    dotColor: '#57534e',
  },
  faltou: {
    label: 'Faltou',
    colorClasses: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60',
    dotColor: '#e11d48',
  },
  cancelado: {
    label: 'Cancelado',
    colorClasses: 'bg-stone-100 text-stone-500 border-stone-200 line-through dark:bg-stone-900 dark:text-stone-500 dark:border-stone-800',
    dotColor: '#a8a29e',
  },
};

export function isStoreOpenNow(store: StoreConfig, now = new Date()): { open: boolean; label: string } {
  const dayKey = String(now.getDay());
  const todayIso = toISODateLocal(now);
  if (store.holidays.includes(todayIso) || store.blockedDates.includes(todayIso)) {
    return { open: false, label: 'Fechado hoje (feriado/bloqueio)' };
  }
  const day = store.businessHours[dayKey];
  if (!day || !day.enabled) {
    return { open: false, label: 'Fechado hoje' };
  }
  const curMin = now.getHours() * 60 + now.getMinutes();
  const openMin = timeToMinutes(day.open);
  const closeMin = timeToMinutes(day.close);
  if (curMin >= openMin && curMin < closeMin) {
    if (day.breakStart && day.breakEnd) {
      const bStart = timeToMinutes(day.breakStart);
      const bEnd = timeToMinutes(day.breakEnd);
      if (curMin >= bStart && curMin < bEnd) {
        return { open: false, label: `Intervalo · retorna às ${day.breakEnd}` };
      }
    }
    return { open: true, label: `Aberto agora · fecha às ${day.close}` };
  }
  if (curMin < openMin) {
    return { open: false, label: `Abre hoje às ${day.open}` };
  }
  return { open: false, label: 'Fechado agora' };
}
