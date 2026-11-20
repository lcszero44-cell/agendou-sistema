import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  MapPin,
  MessageCircle,
  QrCode,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { computeAvailableSlots, getNextDays } from '../lib/availability';
import {
  buildGoogleCalendarUrl,
  buildManageBookingUrl,
  buildWhatsappUrl,
  downloadIcsFile,
  formatCurrencyBRL,
  formatDateBR,
  generatePixBrCode,
  minutesToTime,
  parseISODateLocal,
  STATUS_META,
} from '../lib/brUtils';
import {
  cancelBookingByToken,
  fetchBookingByToken,
  rescheduleBookingByToken,
} from '../lib/storeRepository';
import {
  BookingTokenView,
  ComputedTimeSlot,
  ServiceItem,
  SlotLockRecord,
  StaffMember,
  StoreConfig,
} from '../types/booking';

interface ClientManageBookingProps {
  store: StoreConfig;
  services: ServiceItem[];
  staff: StaffMember[];
  slotLocks: SlotLockRecord[];
  token: string;
  onBackToStore: () => void;
  onRefreshLocks: () => void;
}

export const ClientManageBooking: React.FC<ClientManageBookingProps> = ({
  store,
  services,
  staff,
  slotLocks,
  token,
  onBackToStore,
  onRefreshLocks,
}) => {
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingTokenView | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Cancel confirmation
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Reschedule flow
  const [rescheduling, setRescheduling] = useState(false);
  const days = useMemo(() => getNextDays(14), []);
  const [newDate, setNewDate] = useState(days[0] || '');
  const [newSlot, setNewSlot] = useState<ComputedTimeSlot | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);
    fetchBookingByToken(store, token)
      .then((res) => {
        if (!active) return;
        setBooking(res);
        if (res) setNewDate(res.date >= days[0] ? res.date : days[0]);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Não foi possível localizar o agendamento.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store, token, days]);

  const matchedService = useMemo(
    () => services.find((s) => s.id === booking?.serviceId) || null,
    [services, booking]
  );

  const rescheduleSlots = useMemo(() => {
    if (!booking || !rescheduling) return [];
    const fallbackService: ServiceItem = matchedService || {
      id: booking.serviceId,
      storeId: store.storeId,
      name: booking.serviceName,
      description: '',
      category: '',
      durationMinutes: booking.durationMinutes,
      priceCents: booking.priceCents,
      bufferMinutes: 0,
      requiresDeposit: false,
      depositAmountCents: 0,
      returnDays: 0,
      active: true,
      sortOrder: 1,
    };
    return computeAvailableSlots({
      store,
      service: fallbackService,
      staffList: staff,
      selectedStaffId: booking.staffId,
      date: newDate,
      activeLocks: slotLocks,
      ignoreAppointmentId: booking.appointmentId,
    });
  }, [booking, rescheduling, matchedService, store, staff, newDate, slotLocks]);

  const canModify = booking && (booking.status === 'agendado' || booking.status === 'confirmado');

  const handleCancel = async () => {
    if (!booking) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      await cancelBookingByToken(store, booking);
      setBooking({ ...booking, status: 'cancelado' });
      setConfirmCancel(false);
      onRefreshLocks();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao cancelar agendamento.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReschedule = async () => {
    if (!booking || !newSlot) return;
    const assignedStaff =
      staff.find((s) => s.id === booking.staffId) ||
      staff.find((s) => s.id === newSlot.availableStaffIds[0]);
    if (!assignedStaff) return;

    setActionBusy(true);
    setErrorMsg(null);
    try {
      const updated = await rescheduleBookingByToken({
        store,
        booking,
        newStaff: assignedStaff,
        newDate,
        newStartMinute: newSlot.startMinute,
        bufferMinutes: matchedService?.bufferMinutes || 0,
      });
      setBooking(updated);
      setRescheduling(false);
      setNewSlot(null);
      onRefreshLocks();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao remarcar horário.');
    } finally {
      setActionBusy(false);
    }
  };

  const manageUrl = buildManageBookingUrl(store.storeId, token);
  const pixCode =
    booking && canModify && booking.depositAmountCents > 0 && store.pixKey
      ? generatePixBrCode({
          pixKey: store.pixKey,
          merchantName: store.pixMerchantName || store.name,
          merchantCity: store.pixMerchantCity || 'SAO PAULO',
          amountCents: booking.depositAmountCents,
          txid: booking.appointmentId.slice(0, 12),
        })
      : '';

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onBackToStore}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para {store.name}
        </button>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-stone-500">
              Carregando detalhes do seu agendamento...
            </div>
          ) : !booking ? (
            <div className="py-10 text-center space-y-4">
              <AlertCircle className="w-10 h-10 mx-auto text-stone-400" />
              <div className="space-y-1">
                <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
                  Agendamento não encontrado
                </h1>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Este link pode ter expirado ou pertencer a outra loja.
                </p>
              </div>
              <button
                type="button"
                onClick={onBackToStore}
                className="px-5 py-3 rounded-xl text-white text-sm font-semibold min-h-[44px]"
                style={{ backgroundColor: store.primaryColor }}
              >
                Fazer um novo agendamento
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-stone-100 dark:border-stone-800 pb-4">
                <div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Olá, {booking.clientFirstName} · {store.name}
                  </p>
                  <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mt-0.5">
                    Seu agendamento
                  </h1>
                </div>
                <span
                  className={`px-3 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                    STATUS_META[booking.status].colorClasses
                  }`}
                >
                  {STATUS_META[booking.status].label}
                </span>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/50">
                  <span className="text-xs text-stone-500 dark:text-stone-400 block">Serviço</span>
                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                    {booking.serviceName}
                  </span>
                  <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5 font-mono-nums">
                    {booking.durationMinutes} min · {formatCurrencyBRL(booking.priceCents)}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/50">
                  <span className="text-xs text-stone-500 dark:text-stone-400 block">
                    Data, horário e profissional
                  </span>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 font-mono-nums">
                    {formatDateBR(booking.date, 'weekday')} às {minutesToTime(booking.startMinute)}
                  </span>
                  <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    Com {booking.staffName}
                  </span>
                </div>
              </div>

              {pixCode && (
                <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
                    <QrCode className="w-4 h-4" style={{ color: store.primaryColor }} />
                    Sinal via Pix: {formatCurrencyBRL(booking.depositAmountCents)}
                  </div>
                  <div className="p-2 rounded-lg bg-stone-50 dark:bg-stone-950 font-mono text-[11px] break-all text-stone-600 dark:text-stone-300">
                    {pixCode}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(pixCode);
                      setCopiedPix(true);
                      setTimeout(() => setCopiedPix(false), 2000);
                    }}
                    className="w-full py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    {copiedPix ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    {copiedPix ? 'Pix copiado!' : 'Copiar Pix copia e cola'}
                  </button>
                </div>
              )}

              {/* Reschedule inline picker */}
              {rescheduling && canModify && (
                <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Escolha a nova data e horário
                    </h2>
                    <button
                      type="button"
                      onClick={() => setRescheduling(false)}
                      className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-200"
                    >
                      Cancelar troca
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {days.map((iso) => {
                      const d = parseISODateLocal(iso);
                      const isSel = iso === newDate;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => {
                            setNewDate(iso);
                            setNewSlot(null);
                          }}
                          className={`px-3 py-2 rounded-xl border text-center shrink-0 min-w-[64px] ${
                            isSel
                              ? 'text-white border-transparent'
                              : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                          }`}
                          style={isSel ? { backgroundColor: store.primaryColor } : undefined}
                        >
                          <span className="block text-[10px] capitalize opacity-80">
                            {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                          </span>
                          <span className="font-mono-nums text-sm font-bold">
                            {String(d.getDate()).padStart(2, '0')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {rescheduleSlots.length === 0 ? (
                    <p className="text-xs text-stone-500 py-3 text-center">
                      Nenhum horário livre neste dia para {booking.staffName}.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {rescheduleSlots.map((slot) => {
                        const isSel = newSlot?.startMinute === slot.startMinute;
                        return (
                          <button
                            key={slot.startMinute}
                            type="button"
                            onClick={() => setNewSlot(slot)}
                            className={`py-2.5 rounded-xl border font-mono-nums text-xs font-semibold min-h-[44px] ${
                              isSel
                                ? 'text-white border-transparent'
                                : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200'
                            }`}
                            style={isSel ? { backgroundColor: store.primaryColor } : undefined}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!newSlot || actionBusy}
                    onClick={handleReschedule}
                    className="w-full py-3 rounded-xl text-white text-sm font-semibold min-h-[48px] disabled:opacity-40"
                    style={{ backgroundColor: store.primaryColor }}
                  >
                    {actionBusy ? 'Atualizando...' : 'Confirmar novo horário'}
                  </button>
                </div>
              )}

              {/* Cancel confirmation box */}
              {confirmCancel && canModify && (
                <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 space-y-3">
                  <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                    Tem certeza que deseja cancelar este horário?
                  </p>
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    Ao confirmar, o horário voltará imediatamente para a agenda disponível.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="flex-1 py-2.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-semibold min-h-[44px]"
                    >
                      Manter horário
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleCancel}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold min-h-[44px] disabled:opacity-50"
                    >
                      {actionBusy ? 'Cancelando...' : 'Sim, cancelar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {canModify && !rescheduling && !confirmCancel && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRescheduling(true)}
                    className="py-3 px-4 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 min-h-[48px]"
                    style={{ backgroundColor: store.primaryColor }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Remarcar horário
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="py-3 px-4 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-sm font-semibold flex items-center justify-center gap-2 min-h-[48px]"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancelar agendamento
                  </button>
                </div>
              )}

              {booking.status === 'cancelado' && (
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/50 text-center space-y-3">
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    Este agendamento foi cancelado e o horário foi liberado na agenda.
                  </p>
                  <button
                    type="button"
                    onClick={onBackToStore}
                    className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold min-h-[44px]"
                    style={{ backgroundColor: store.primaryColor }}
                  >
                    Agendar novo horário
                  </button>
                </div>
              )}

              {/* Calendar & WhatsApp helpers */}
              {canModify && (
                <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex flex-wrap gap-2">
                  <a
                    href={buildGoogleCalendarUrl({
                      title: `${booking.serviceName} — ${store.name}`,
                      date: booking.date,
                      startMinute: booking.startMinute,
                      endMinute: booking.endMinute,
                      details: `Profissional: ${booking.staffName}\nLink: ${manageUrl}`,
                      location: store.address,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 flex items-center justify-center gap-1.5 min-h-[44px]"
                  >
                    <Calendar className="w-4 h-4" />
                    Google Agenda
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      downloadIcsFile({
                        uid: booking.appointmentId,
                        title: `${booking.serviceName} — ${store.name}`,
                        date: booking.date,
                        startMinute: booking.startMinute,
                        endMinute: booking.endMinute,
                        details: `Profissional: ${booking.staffName}`,
                        location: store.address,
                      })
                    }
                    className="flex-1 py-2.5 px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 flex items-center justify-center gap-1.5 min-h-[44px]"
                  >
                    <Download className="w-4 h-4" />
                    Apple (.ics)
                  </button>
                  <a
                    href={buildWhatsappUrl(
                      store.whatsapp,
                      `Olá ${store.name}, estou falando sobre meu agendamento de ${booking.serviceName} em ${formatDateBR(booking.date, 'short')} às ${minutesToTime(booking.startMinute)}.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-medium flex items-center justify-center gap-1.5 min-h-[44px]"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Falar no WhatsApp
                  </a>
                </div>
              )}

              {/* Address & instructions */}
              <div className="pt-4 border-t border-stone-100 dark:border-stone-800 space-y-2 text-xs text-stone-600 dark:text-stone-400">
                <p className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-stone-400" />
                  <span>{store.address}</span>
                </p>
                {store.arrivalInstructions && (
                  <p className="flex items-start gap-2">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5 text-stone-400" />
                    <span>{store.arrivalInstructions}</span>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
