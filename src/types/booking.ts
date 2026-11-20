export type SegmentKey =
  | 'odontologia'
  | 'estetica'
  | 'barbearia'
  | 'salao'
  | 'fisioterapia'
  | 'petshop'
  | 'personal';

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'em_atendimento'
  | 'concluido'
  | 'faltou'
  | 'cancelado';

export type WaitlistPeriod = 'manha' | 'tarde' | 'noite' | 'qualquer';
export type WaitlistStatus = 'aguardando' | 'notificado' | 'agendado' | 'removido';
export type ReminderResponse = '' | 'confirmou' | 'pediu_remarcar' | 'sem_resposta';

export interface DaySchedule {
  enabled: boolean;
  open: string;       // "09:00"
  close: string;      // "19:00"
  breakStart?: string; // "12:00"
  breakEnd?: string;   // "13:00"
}

export type WeeklySchedule = Record<string, DaySchedule>; // "0" (Dom) .. "6" (Sáb)

export interface MessageTemplates {
  confirmation: string;
  reminder24h: string;
  reminder2h: string;
  reschedule: string;
  cancel: string;
  postVisitReview: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ReviewItem {
  author: string;
  role: string;
  rating: number;
  comment: string;
  date: string;
}

export interface StoreConfig {
  storeId: string;
  slug: string;
  ownerId: string;
  segment: SegmentKey;
  name: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImage: string;
  primaryColor: string;
  accentColor: string;
  whatsapp: string;
  address: string;
  mapsQuery: string;
  googleReviewUrl: string;
  rating: number;
  totalAttendances: number;
  showReviews?: boolean;
  trustBadges: string[];
  businessHours: WeeklySchedule;
  holidays: string[];
  blockedDates: string[];
  minAdvanceMinutes: number;
  slotIntervalMinutes: number;
  cancellationPolicy: string;
  arrivalInstructions: string;
  pixKey: string;
  pixMerchantName: string;
  pixMerchantCity: string;
  messageTemplates: MessageTemplates;
  faq: FaqItem[];
  reviews: ReviewItem[];
  onboardingCompleted: boolean;
  dailyReminderTime?: string;      // "18:00"
  automationWebhookUrl?: string;   // Optional POST JSON webhook URL (n8n/Make)
  isLiveFirestore?: boolean;
}

export interface ServiceItem {
  id: string;
  storeId: string;
  name: string;
  description: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
  bufferMinutes: number;
  requiresDeposit: boolean;
  depositAmountCents: number;
  returnDays: number;
  active: boolean;
  sortOrder: number;
}

export interface StaffMember {
  id: string;
  storeId: string;
  name: string;
  role: string;
  specialty: string;
  bio: string;
  avatarUrl: string;
  serviceIds: string[];
  schedule: WeeklySchedule;
  daysOff: string[];
  active: boolean;
}

export interface SlotLockRecord {
  id: string;
  storeId: string;
  staffId: string;
  date: string;
  blockMinute: number;
  startMinute: number;
  endMinute: number;
  appointmentId: string;
  manageToken: string;
  releaseToken: string;
  status: 'active' | 'released';
}

export interface ClientLockRecord {
  id: string;
  storeId: string;
  clientHash: string;
  date: string;
  blockMinute: number;
  appointmentId: string;
  manageToken: string;
  releaseToken: string;
  status: 'active' | 'released';
}

export interface AppointmentRecord {
  id: string;
  storeId: string;
  storeOwnerId: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  priceCents: number;
  depositAmountCents: number;
  status: AppointmentStatus;
  clientName: string;
  clientWhatsapp: string;
  clientEmail?: string;
  clientNotes?: string;
  lgpdConsent: boolean;
  manageToken: string;
  clientAuthToken: string;
  blockLockIds: string[];
  clientBlockLockIds?: string[];
  reminderSentAt?: string;
  reminderResponse?: ReminderResponse;
  createdAtIso?: string;
}

export interface BookingTokenView {
  token: string;
  storeId: string;
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  priceCents: number;
  depositAmountCents: number;
  status: AppointmentStatus;
  clientFirstName: string;
  blockLockIds: string[];
  clientBlockLockIds?: string[];
  clientPhoneHash?: string;
}

export interface WaitlistRecord {
  id: string;
  storeId: string;
  storeOwnerId: string;
  serviceId: string;
  serviceName: string;
  staffId?: string;
  preferredDate: string;
  preferredPeriod: WaitlistPeriod;
  clientName: string;
  clientWhatsapp: string;
  lgpdConsent: boolean;
  status: WaitlistStatus;
  createdAtIso?: string;
}

export interface ComputedTimeSlot {
  startMinute: number;
  endMinute: number;
  label: string;
  availableStaffIds: string[];
  remainingSpots: number;
  period: 'manha' | 'tarde' | 'noite';
}
