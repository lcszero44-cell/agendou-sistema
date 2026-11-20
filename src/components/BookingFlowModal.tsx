import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  QrCode,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  computeAvailableSlots,
  findNextAvailableSlot,
  getEligibleStaff,
  getNextDays,
} from '../lib/availability';
import {
  buildGoogleCalendarUrl,
  buildManageBookingUrl,
  buildWhatsappUrl,
  downloadIcsFile,
  formatBrazilianPhoneInput,
  formatCurrencyBRL,
  formatDateBR,
  generatePixBrCode,
  interpolateTemplate,
  isValidBrazilianPhone,
  minutesToTime,
  parseISODateLocal,
  toISODateLocal,
} from '../lib/brUtils';
import { addWaitlistEntry, createBookingAtomic } from '../lib/storeRepository';
import {
  AppointmentRecord,
  ComputedTimeSlot,
  ServiceItem,
  SlotLockRecord,
  StaffMember,
  StoreConfig,
  WaitlistPeriod,
} from '../types/booking';
import { LgpdPrivacyModal } from './LgpdPrivacyModal';
import { SafeImage } from './SafeImage';

interface BookingFlowModalProps {
  open: boolean;
  store: StoreConfig;
  services: ServiceItem[];
  staff: StaffMember[];
  slotLocks: SlotLockRecord[];
  initialServiceId?: string | null;
  initialStaffId?: string | null;
  onClose: () => void;
  onBooked: (appointment: AppointmentRecord, manageToken: string) => void;
  onOpenManageLink: (token: string) => void;
}

export const BookingFlowModal: React.FC<BookingFlowModalProps> = ({
  open,
  store,
  services,
  staff,
  slotLocks,
  initialServiceId,
  initialStaffId,
  onClose,
  onBooked,
  onOpenManageLink,
}) => {
  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(() => {
    if (initialServiceId && initialStaffId) return 3;
    if (initialServiceId) return 2;
    return 1;
  });

  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    initialServiceId || activeServices[0]?.id || ''
  );
  const [selectedStaffId, setSelectedStaffId] = useState<string | 'any'>(
    initialStaffId || 'any'
  );
  const days = useMemo(() => getNextDays(14), []);
  const [selectedDate, setSelectedDate] = useState<string>(days[0] || toISODateLocal(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<ComputedTimeSlot | null>(null);

  // Client fields
  const [clientName, setClientName] = useState('');
  const [clientWhatsapp, setClientWhatsapp] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Waitlist state
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistPeriod, setWaitlistPeriod] = useState<WaitlistPeriod>('qualquer');
  const [waitlistSaved, setWaitlistSaved] = useState(false);

  // Submission & confirmation
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    appointment: AppointmentRecord;
    manageToken: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<'pix' | 'link' | null>(null);

  // Sync initial pre-selections when modal opens
  React.useEffect(() => {
    if (open) {
      setConfirmed(null);
      setErrorMsg(null);
      setShowWaitlist(false);
      setWaitlistSaved(false);
      setSelectedSlot(null);
      if (initialServiceId) {
        setSelectedServiceId(initialServiceId);
        if (initialStaffId) {
          setSelectedStaffId(initialStaffId);
          setStep(3);
        } else {
          setSelectedStaffId('any');
          setStep(2);
        }
      } else {
        setSelectedServiceId(activeServices[0]?.id || '');
        setSelectedStaffId(initialStaffId || 'any');
        setStep(1);
      }
    }
  }, [open, initialServiceId, initialStaffId, activeServices]);

  const selectedService = useMemo(
    () => activeServices.find((s) => s.id === selectedServiceId) || activeServices[0] || null,
    [activeServices, selectedServiceId]
  );

  const eligibleStaff = useMemo(() => {
    if (!selectedService) return [];
    return getEligibleStaff(staff, selectedService.id);
  }, [staff, selectedService]);

  const nextAvailable = useMemo(() => {
    if (!selectedService) return null;
    return findNextAvailableSlot({
      store,
      service: selectedService,
      staffList: staff,
      selectedStaffId,
      activeLocks: slotLocks,
      daysAhead: 14,
    });
  }, [store, selectedService, staff, selectedStaffId, slotLocks]);

  const daySlots = useMemo(() => {
    if (!selectedService) return [];
    return computeAvailableSlots({
      store,
      service: selectedService,
      staffList: staff,
      selectedStaffId,
      date: selectedDate,
      activeLocks: slotLocks,
    });
  }, [store, selectedService, staff, selectedStaffId, selectedDate, slotLocks]);

  const groupedSlots = useMemo(() => {
    return {
      manha: daySlots.filter((s) => s.period === 'manha'),
      tarde: daySlots.filter((s) => s.period === 'tarde'),
      noite: daySlots.filter((s) => s.period === 'noite'),
    };
  }, [daySlots]);

  if (!open) return null;

  const progressPercent = step === 5 ? 100 : step * 25;

  const handlePickNextAvailable = () => {
    if (!nextAvailable) return;
    setSelectedDate(nextAvailable.date);
    setSelectedSlot(nextAvailable.slot);
    setShowWaitlist(false);
    setErrorMsg(null);
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedService || !selectedSlot) {
      setErrorMsg('Selecione um serviço e um horário disponível.');
      return;
    }
    if (clientName.trim().length < 2) {
      setErrorMsg('Informe seu nome completo para confirmarmos o horário.');
      return;
    }
    if (!isValidBrazilianPhone(clientWhatsapp)) {
      setErrorMsg('Digite um número de WhatsApp brasileiro válido com DDD (ex: (11) 99999-8888).');
      return;
    }
    if (!lgpdConsent) {
      setErrorMsg('Para continuar, aceite a Política de Privacidade (LGPD).');
      return;
    }

    // Pick assigned staff (chosen explicitly or first available at that slot)
    const assignedStaffId =
      selectedStaffId !== 'any'
        ? selectedStaffId
        : selectedSlot.availableStaffIds[0];
    const assignedStaff = staff.find((s) => s.id === assignedStaffId);
    if (!assignedStaff) {
      setErrorMsg('Profissional indisponível para este horário. Escolha outro horário.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createBookingAtomic({
        store,
        service: selectedService,
        staff: assignedStaff,
        date: selectedDate,
        startMinute: selectedSlot.startMinute,
        clientName,
        clientWhatsapp,
        clientEmail,
        clientNotes,
        lgpdConsent: true,
      });
      setConfirmed(result);
      setStep(5);
      onBooked(result.appointment, result.manageToken);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir o agendamento. Tente outro horário.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selectedService) return;
    if (clientName.trim().length < 2) {
      setErrorMsg('Informe seu nome para entrar na lista de espera.');
      return;
    }
    if (!isValidBrazilianPhone(clientWhatsapp)) {
      setErrorMsg('Informe um WhatsApp válido com DDD para avisarmos se abrir vaga.');
      return;
    }
    if (!lgpdConsent) {
      setErrorMsg('Aceite a Política de Privacidade (LGPD) para entrar na fila.');
      return;
    }
    setSubmitting(true);
    try {
      await addWaitlistEntry({
        store,
        service: selectedService,
        staffId: selectedStaffId === 'any' ? '' : selectedStaffId,
        preferredDate: selectedDate,
        preferredPeriod: waitlistPeriod,
        clientName,
        clientWhatsapp,
        lgpdConsent: true,
      });
      setWaitlistSaved(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar na lista de espera.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'pix' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(type);
      setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const pixCode =
    confirmed && confirmed.appointment.depositAmountCents > 0 && store.pixKey
      ? generatePixBrCode({
          pixKey: store.pixKey,
          merchantName: store.pixMerchantName || store.name,
          merchantCity: store.pixMerchantCity || 'SAO PAULO',
          amountCents: confirmed.appointment.depositAmountCents,
          txid: confirmed.appointment.id.slice(0, 12),
        })
      : '';

  const manageUrl = confirmed
    ? buildManageBookingUrl(store.storeId, confirmed.manageToken)
    : '';

  const whatsappConfirmUrl = confirmed
    ? buildWhatsappUrl(
        store.whatsapp,
        interpolateTemplate(store.messageTemplates.confirmation, {
          loja: store.name,
          servico: confirmed.appointment.serviceName,
          profissional: confirmed.appointment.staffName,
          data: formatDateBR(confirmed.appointment.date, 'short'),
          hora: minutesToTime(confirmed.appointment.startMinute),
          cliente: confirmed.appointment.clientName,
          link: manageUrl,
          valor: formatCurrencyBRL(confirmed.appointment.priceCents),
          diaDaSemana: formatDateBR(confirmed.appointment.date, 'long').split(',')[0] || '',
        })
      )
    : '';

  const googleCalUrl = confirmed
    ? buildGoogleCalendarUrl({
        title: `${confirmed.appointment.serviceName} — ${store.name}`,
        date: confirmed.appointment.date,
        startMinute: confirmed.appointment.startMinute,
        endMinute: confirmed.appointment.endMinute,
        details: `Profissional: ${confirmed.appointment.staffName}\nGerenciar horário: ${manageUrl}`,
        location: store.address,
      })
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Agendamento online"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top bar + Progress */}
        <div className="px-5 pt-4 pb-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
          <div className="w-10 h-1 rounded-full bg-stone-300 dark:bg-stone-700 mx-auto mb-3 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {step > 1 && step < 5 && (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setShowWaitlist(false);
                    setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
                  }}
                  aria-label="Voltar etapa"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  {step === 5 ? 'Agendamento confirmado' : `Etapa ${step} de 4 · ${store.name}`}
                </p>
                <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 truncate">
                  {step === 1 && 'Escolha o serviço'}
                  {step === 2 && 'Escolha o profissional'}
                  {step === 3 && (showWaitlist ? 'Entrar na lista de espera' : 'Escolha o dia e horário')}
                  {step === 4 && 'Seus dados para confirmar'}
                  {step === 5 && 'Tudo certo! Horário reservado'}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar agendamento"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-3 h-1.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%`, backgroundColor: store.primaryColor }}
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm"
            >
              {errorMsg}
            </div>
          )}

          {/* STEP 1: SERVICE */}
          {step === 1 && (
            <div className="space-y-3">
              {activeServices.length === 0 ? (
                <p className="text-sm text-stone-500 dark:text-stone-400 py-8 text-center">
                  Nenhum serviço ativo disponível no momento.
                </p>
              ) : (
                activeServices.map((srv) => {
                  const isSelected = srv.id === selectedServiceId;
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => {
                        setSelectedServiceId(srv.id);
                        setSelectedSlot(null);
                        setStep(2);
                      }}
                      className={`w-full text-left p-4 rounded-xl border transition-all min-h-[68px] flex items-start justify-between gap-4 ${
                        isSelected
                          ? 'border-stone-900 dark:border-stone-100 bg-stone-50 dark:bg-stone-800/70'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 bg-white dark:bg-stone-900'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs text-stone-500 dark:text-stone-400">
                          {srv.category} · {srv.durationMinutes} min
                          {srv.requiresDeposit && srv.depositAmountCents > 0
                            ? ` · Sinal Pix ${formatCurrencyBRL(srv.depositAmountCents)}`
                            : ''}
                        </div>
                        <div className="font-semibold text-stone-900 dark:text-stone-100">
                          {srv.name}
                        </div>
                        {srv.description && (
                          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-2">
                            {srv.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pt-1">
                        <span className="font-mono-nums text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {formatCurrencyBRL(srv.priceCents)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-stone-400" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* STEP 2: STAFF */}
          {step === 2 && selectedService && (
            <div className="space-y-3">
              <div className="text-xs text-stone-500 dark:text-stone-400">
                Serviço selecionado:{' '}
                <strong className="text-stone-900 dark:text-stone-100">{selectedService.name}</strong>{' '}
                · {selectedService.durationMinutes} min ·{' '}
                <span className="font-mono-nums">{formatCurrencyBRL(selectedService.priceCents)}</span>
              </div>

              {/* Any available option */}
              <button
                type="button"
                onClick={() => {
                  setSelectedStaffId('any');
                  setSelectedSlot(null);
                  setStep(3);
                }}
                className={`w-full text-left p-4 rounded-xl border transition-all min-h-[68px] flex items-center justify-between gap-4 ${
                  selectedStaffId === 'any'
                    ? 'border-stone-900 dark:border-stone-100 bg-stone-50 dark:bg-stone-800/70'
                    : 'border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: store.primaryColor }}
                  >
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-stone-900 dark:text-stone-100">
                      Qualquer disponível (Mais rápido)
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Mostra todos os horários livres mais próximos da equipe
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
              </button>

              {eligibleStaff.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => {
                    setSelectedStaffId(member.id);
                    setSelectedSlot(null);
                    setStep(3);
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all min-h-[68px] flex items-center justify-between gap-4 ${
                    selectedStaffId === member.id
                      ? 'border-stone-900 dark:border-stone-100 bg-stone-50 dark:bg-stone-800/70'
                      : 'border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <SafeImage
                      src={member.avatarUrl}
                      alt={member.name}
                      fallbackLabel={member.name}
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                        {member.name}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                        {member.role}
                        {member.specialty ? ` · ${member.specialty}` : ''}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* STEP 3: DATE & TIME (or Waitlist) */}
          {step === 3 && selectedService && !showWaitlist && (
            <div className="space-y-5">
              {/* Next available shortcut */}
              {nextAvailable && (
                <button
                  type="button"
                  onClick={handlePickNextAvailable}
                  className="w-full p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center justify-between gap-3 text-left min-h-[52px]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Sparkles className="w-4 h-4 shrink-0" style={{ color: store.primaryColor }} />
                    <div className="text-sm text-stone-800 dark:text-stone-200 truncate">
                      Próximo horário livre:{' '}
                      <strong className="font-semibold">
                        {formatDateBR(nextAvailable.date, 'weekday')} às {nextAvailable.slot.label}
                      </strong>
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold whitespace-nowrap shrink-0"
                    style={{ color: store.primaryColor }}
                  >
                    Selecionar
                  </span>
                </button>
              )}

              {/* Horizontal Date Scroller */}
              <div>
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
                  Escolha o dia
                </p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {days.map((iso) => {
                    const d = parseISODateLocal(iso);
                    const weekday = d
                      .toLocaleDateString('pt-BR', { weekday: 'short' })
                      .replace('.', '');
                    const dayNum = String(d.getDate()).padStart(2, '0');
                    const monthShort = d
                      .toLocaleDateString('pt-BR', { month: 'short' })
                      .replace('.', '');
                    const isSelected = iso === selectedDate;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          setSelectedDate(iso);
                          setSelectedSlot(null);
                        }}
                        className={`flex flex-col items-center justify-center min-w-[68px] py-2.5 px-2 rounded-xl border transition-all shrink-0 ${
                          isSelected
                            ? 'text-white border-transparent'
                            : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-600 bg-white dark:bg-stone-900'
                        }`}
                        style={isSelected ? { backgroundColor: store.primaryColor } : undefined}
                      >
                        <span className={`text-[11px] capitalize ${isSelected ? 'text-white/85' : 'text-stone-500 dark:text-stone-400'}`}>
                          {weekday}
                        </span>
                        <span className="font-mono-nums text-lg font-bold leading-tight">
                          {dayNum}
                        </span>
                        <span className={`text-[10px] capitalize ${isSelected ? 'text-white/85' : 'text-stone-400'}`}>
                          {monthShort}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slots grid */}
              {daySlots.length === 0 ? (
                <div className="p-6 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 text-center space-y-3">
                  <Calendar className="w-7 h-7 mx-auto text-stone-400" />
                  <div className="space-y-1">
                    <p className="font-semibold text-stone-900 dark:text-stone-100">
                      Sem horários livres em {formatDateBR(selectedDate, 'short')}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Este dia está lotado, fechado ou fora da antecedência mínima. Você pode escolher
                      outro dia ou entrar na lista de espera.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWaitlist(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-sm font-medium text-stone-800 dark:text-stone-200 hover:bg-white dark:hover:bg-stone-800 min-h-[44px]"
                  >
                    Entrar na lista de espera para este dia
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {(
                    [
                      { key: 'manha', title: 'Manhã', list: groupedSlots.manha },
                      { key: 'tarde', title: 'Tarde', list: groupedSlots.tarde },
                      { key: 'noite', title: 'Noite', list: groupedSlots.noite },
                    ] as const
                  ).map(
                    (group) =>
                      group.list.length > 0 && (
                        <div key={group.key} className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                            <span className="font-medium">{group.title}</span>
                            <span className="tabular-nums">
                              {group.list.length}{' '}
                              {group.list.length === 1 ? 'horário livre' : 'horários livres'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {group.list.map((slot) => {
                              const isSelected = selectedSlot?.startMinute === slot.startMinute;
                              const lowSpots =
                                selectedStaffId === 'any' &&
                                eligibleStaff.length > 1 &&
                                slot.remainingSpots <= 2;
                              return (
                                <button
                                  key={slot.startMinute}
                                  type="button"
                                  onClick={() => setSelectedSlot(slot)}
                                  className={`py-2.5 px-2 rounded-xl border text-center transition-all min-h-[48px] flex flex-col items-center justify-center ${
                                    isSelected
                                      ? 'text-white border-transparent'
                                      : 'border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 hover:border-stone-400 dark:hover:border-stone-600 bg-white dark:bg-stone-900'
                                  }`}
                                  style={
                                    isSelected ? { backgroundColor: store.primaryColor } : undefined
                                  }
                                >
                                  <span className="font-mono-nums text-sm font-semibold">
                                    {slot.label}
                                  </span>
                                  {lowSpots && (
                                    <span
                                      className={`text-[10px] leading-tight mt-0.5 ${
                                        isSelected
                                          ? 'text-white/90'
                                          : 'text-amber-700 dark:text-amber-400'
                                      }`}
                                    >
                                      {slot.remainingSpots === 1
                                        ? 'última vaga'
                                        : `restam ${slot.remainingSpots}`}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )
                  )}

                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400">
                    <span>Não achou o horário ideal?</span>
                    <button
                      type="button"
                      onClick={() => setShowWaitlist(true)}
                      className="font-semibold underline underline-offset-2 text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white py-1"
                    >
                      Entrar na lista de espera
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WAITLIST FORM */}
          {step === 3 && showWaitlist && selectedService && (
            <div>
              {waitlistSaved ? (
                <div className="p-6 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                    Você entrou na lista de espera!
                  </h3>
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    Se algum cliente cancelar em {formatDateBR(selectedDate, 'short')}, {store.name}{' '}
                    recebe o aviso na hora e chama você no WhatsApp.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium min-h-[44px]"
                  >
                    Voltar para a página
                  </button>
                </div>
              ) : (
                <form onSubmit={handleJoinWaitlist} className="space-y-4">
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    Avise qual período prefere em{' '}
                    <strong>{formatDateBR(selectedDate, 'short')}</strong> para{' '}
                    <strong>{selectedService.name}</strong>. Se surgir uma vaga, avisamos no seu
                    WhatsApp.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                      Período preferido
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          ['manha', 'Manhã'],
                          ['tarde', 'Tarde'],
                          ['noite', 'Noite'],
                          ['qualquer', 'Qualquer'],
                        ] as const
                      ).map(([val, lbl]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setWaitlistPeriod(val)}
                          className={`py-2.5 px-3 rounded-xl border text-xs font-medium min-h-[44px] transition-colors ${
                            waitlistPeriod === val
                              ? 'text-white border-transparent'
                              : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                          }`}
                          style={
                            waitlistPeriod === val ? { backgroundColor: store.primaryColor } : undefined
                          }
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                      Seu nome *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={90}
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: Ana Paula Silva"
                      className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                      Seu WhatsApp (com DDD) *
                    </label>
                    <input
                      type="tel"
                      required
                      value={clientWhatsapp}
                      onChange={(e) => setClientWhatsapp(formatBrazilianPhoneInput(e.target.value))}
                      placeholder="(11) 99999-8888"
                      className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm font-mono-nums"
                    />
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lgpdConsent}
                      onChange={(e) => setLgpdConsent(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded accent-stone-900"
                    />
                    <span className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                      Concordo com o uso do meu nome e WhatsApp para contato sobre vagas disponíveis,
                      conforme a{' '}
                      <button
                        type="button"
                        onClick={() => setShowPrivacy(true)}
                        className="underline font-medium text-stone-900 dark:text-stone-200"
                      >
                        Política de Privacidade (LGPD)
                      </button>
                      .
                    </span>
                  </label>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowWaitlist(false)}
                      className="px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 text-sm font-medium text-stone-700 dark:text-stone-300 min-h-[48px]"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-3 px-4 rounded-xl text-white text-sm font-semibold min-h-[48px] disabled:opacity-60"
                      style={{ backgroundColor: store.primaryColor }}
                    >
                      {submitting ? 'Salvando...' : 'Entrar na lista de espera'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* STEP 4: CLIENT DETAILS */}
          {step === 4 && selectedService && selectedSlot && (
            <form id="booking-client-form" onSubmit={handleConfirmBooking} className="space-y-4">
              {/* Compact Summary Strip */}
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 space-y-1">
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  {formatDateBR(selectedDate, 'long')} às{' '}
                  <strong className="font-mono-nums text-stone-900 dark:text-stone-100">
                    {selectedSlot.label}
                  </strong>
                </div>
                <div className="font-semibold text-stone-900 dark:text-stone-100">
                  {selectedService.name}
                </div>
                <div className="text-xs text-stone-600 dark:text-stone-400">
                  {selectedStaffId === 'any'
                    ? `Profissional: ${
                        staff.find((s) => s.id === selectedSlot.availableStaffIds[0])?.name ||
                        'Disponível'
                      }`
                    : `Profissional: ${staff.find((s) => s.id === selectedStaffId)?.name || ''}`}{' '}
                  · {selectedService.durationMinutes} min ·{' '}
                  <span className="font-mono-nums font-semibold text-stone-900 dark:text-stone-100">
                    {formatCurrencyBRL(selectedService.priceCents)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                  Seu nome completo *
                </label>
                <input
                  type="text"
                  required
                  maxLength={90}
                  autoComplete="name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Como prefere ser chamado(a)"
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                  WhatsApp (com DDD) *
                </label>
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  value={clientWhatsapp}
                  onChange={(e) => setClientWhatsapp(formatBrazilianPhoneInput(e.target.value))}
                  placeholder="(11) 99999-8888"
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm font-mono-nums"
                />
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                  Usado apenas para confirmação e lembretes do seu horário.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                  E-mail (opcional)
                </label>
                <input
                  type="email"
                  maxLength={120}
                  autoComplete="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="voce@email.com"
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                  Observações, alergias ou preferências (opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder="Ex: sensibilidade, preferência de atendimento..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm resize-none"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={lgpdConsent}
                  onChange={(e) => setLgpdConsent(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded accent-stone-900"
                />
                <span className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  Li e concordo com a{' '}
                  <button
                    type="button"
                    onClick={() => setShowPrivacy(true)}
                    className="underline font-medium text-stone-900 dark:text-stone-200"
                  >
                    Política de Privacidade (LGPD)
                  </button>
                  . Autorizo o uso do meu contato para confirmação e lembretes deste agendamento.
                </span>
              </label>
            </form>
          )}

          {/* STEP 5: CONFIRMATION */}
          {step === 5 && confirmed && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-stone-900 dark:text-stone-100">
                      Horário reservado com sucesso
                    </h3>
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      {confirmed.appointment.clientName} · {store.name}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                      Serviço
                    </span>
                    <span className="font-medium text-stone-900 dark:text-stone-100">
                      {confirmed.appointment.serviceName}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                      Profissional
                    </span>
                    <span className="font-medium text-stone-900 dark:text-stone-100">
                      {confirmed.appointment.staffName}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                      Data e horário
                    </span>
                    <span className="font-mono-nums font-semibold text-stone-900 dark:text-stone-100">
                      {formatDateBR(confirmed.appointment.date, 'short')} às{' '}
                      {minutesToTime(confirmed.appointment.startMinute)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                      Valor estimado
                    </span>
                    <span className="font-mono-nums font-semibold text-stone-900 dark:text-stone-100">
                      {formatCurrencyBRL(confirmed.appointment.priceCents)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Optional Pix Deposit BR Code */}
              {pixCode && (
                <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
                      <QrCode className="w-4 h-4" style={{ color: store.primaryColor }} />
                      Sinal via Pix ({formatCurrencyBRL(confirmed.appointment.depositAmountCents)})
                    </div>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      Abatido do total
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    Copie o código Pix abaixo (já com o valor preenchido) e cole no aplicativo do seu
                    banco para garantir o horário.
                  </p>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 font-mono text-[11px] text-stone-700 dark:text-stone-300 break-all select-all">
                    {pixCode}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pixCode, 'pix')}
                    className="w-full py-2.5 px-4 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center justify-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[44px]"
                  >
                    {copiedKey === 'pix' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        Código Pix copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copiar Pix copia e cola
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Primary WhatsApp Confirmation CTA */}
              <a
                href={whatsappConfirmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors min-h-[48px]"
              >
                <MessageCircle className="w-5 h-5" />
                Confirmar pelo WhatsApp
              </a>

              {/* Add to Calendar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href={googleCalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-4 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px]"
                >
                  <Calendar className="w-4 h-4" />
                  Google Calendar
                </a>
                <button
                  type="button"
                  onClick={() =>
                    downloadIcsFile({
                      uid: confirmed.appointment.id,
                      title: `${confirmed.appointment.serviceName} — ${store.name}`,
                      date: confirmed.appointment.date,
                      startMinute: confirmed.appointment.startMinute,
                      endMinute: confirmed.appointment.endMinute,
                      details: `Profissional: ${confirmed.appointment.staffName} | Gerenciar: ${manageUrl}`,
                      location: store.address,
                    })
                  }
                  className="py-3 px-4 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px]"
                >
                  <Download className="w-4 h-4" />
                  Apple / Outlook (.ics)
                </button>
              </div>

              {/* Unique Self-Service Manage Link */}
              <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                    Seu link único (ver, remarcar ou cancelar sem login)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(manageUrl, 'link')}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-800 dark:text-stone-200 flex items-center justify-center gap-1.5 min-h-[44px]"
                  >
                    {copiedKey === 'link' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        Link copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copiar meu link
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenManageLink(confirmed.manageToken);
                    }}
                    className="py-2.5 px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium text-stone-800 dark:text-stone-200 flex items-center gap-1.5 min-h-[44px] whitespace-nowrap"
                  >
                    Abrir link
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Arrival & Cancellation Policy */}
              <div className="text-xs text-stone-600 dark:text-stone-400 space-y-2 pt-1">
                {store.arrivalInstructions && (
                  <p>
                    <strong className="text-stone-800 dark:text-stone-200">Chegada:</strong>{' '}
                    {store.arrivalInstructions}
                  </p>
                )}
                {store.cancellationPolicy && (
                  <p>
                    <strong className="text-stone-800 dark:text-stone-200">Cancelamento:</strong>{' '}
                    {store.cancellationPolicy}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Sticky Action Footer for Steps 3 & 4 */}
        {step === 3 && !showWaitlist && (
          <div className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0 flex items-center justify-between gap-4">
            <div className="text-xs text-stone-600 dark:text-stone-400 min-w-0">
              {selectedSlot ? (
                <>
                  <span className="block truncate font-semibold text-stone-900 dark:text-stone-100">
                    {formatDateBR(selectedDate, 'weekday')} às {selectedSlot.label}
                  </span>
                  <span className="font-mono-nums">
                    {selectedService ? formatCurrencyBRL(selectedService.priceCents) : ''}
                  </span>
                </>
              ) : (
                <span>Selecione um horário acima</span>
              )}
            </div>
            <button
              type="button"
              disabled={!selectedSlot}
              onClick={() => {
                setErrorMsg(null);
                setStep(4);
              }}
              className="px-6 py-3 rounded-xl text-white text-sm font-semibold min-h-[48px] disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0"
              style={{ backgroundColor: store.primaryColor }}
            >
              Continuar
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0">
            <button
              type="submit"
              form="booking-client-form"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-xl text-white text-sm font-semibold min-h-[48px] disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
              style={{ backgroundColor: store.primaryColor }}
            >
              <UserCheck className="w-4 h-4" />
              {submitting ? 'Reservando horário...' : 'Confirmar agendamento'}
            </button>
          </div>
        )}
      </div>

      <LgpdPrivacyModal
        open={showPrivacy}
        storeName={store.name}
        onClose={() => setShowPrivacy(false)}
      />
    </div>
  );
};
