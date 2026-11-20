import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  HelpCircle,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  StickyNote,
  Users,
  X,
} from 'lucide-react';
import { computeAvailableSlots, findScheduleGaps, getNextDays } from '../../lib/availability';
import {
  buildManageBookingUrl,
  buildWhatsappUrl,
  downloadDailyOwnerReminderIcs,
  formatBrazilianPhoneInput,
  formatCurrencyBRL,
  formatDateBR,
  formatDateTimeBR,
  generatePixBrCode,
  getWeekdayNameFromIso,
  interpolateTemplate,
  isValidBrazilianPhone,
  minutesToTime,
  parseISODateLocal,
  STATUS_META,
  toISODateLocal,
} from '../../lib/brUtils';
import {
  adminRecordReminderSent,
  adminRescheduleAppointment,
  adminUpdateAppointmentNotes,
  adminUpdateAppointmentStatus,
  adminUpdateReminderResponse,
  adminUpdateWaitlistStatus,
  createBookingAtomic,
} from '../../lib/storeRepository';
import {
  AppointmentRecord,
  AppointmentStatus,
  ReminderResponse,
  ServiceItem,
  SlotLockRecord,
  StaffMember,
  StoreConfig,
  WaitlistRecord,
} from '../../types/booking';
import { ReminderModal } from './ReminderModal';

interface AdminAgendaTabProps {
  store: StoreConfig;
  services: ServiceItem[];
  staff: StaffMember[];
  appointments: AppointmentRecord[];
  slotLocks: SlotLockRecord[];
  waitlist: WaitlistRecord[];
  initialFocusReminders?: boolean;
}

const RESPONSE_BADGE_META: Record<
  ReminderResponse,
  { label: string; classes: string }
> = {
  '': {
    label: '',
    classes: '',
  },
  confirmou: {
    label: 'Confirmou',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
  },
  pediu_remarcar: {
    label: 'Pediu remarcar',
    classes: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
  },
  sem_resposta: {
    label: 'Sem resposta',
    classes: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
  },
};

export const AdminAgendaTab: React.FC<AdminAgendaTabProps> = ({
  store,
  services,
  staff,
  appointments,
  slotLocks,
  waitlist,
  initialFocusReminders = false,
}) => {
  const [viewMode, setViewMode] = useState<'dia' | 'semana' | 'equipe'>('dia');
  const [selectedDate, setSelectedDate] = useState<string>(toISODateLocal(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'todos'>('todos');

  const [selectedAppt, setSelectedAppt] = useState<AppointmentRecord | null>(null);
  const [reminderModalApptId, setReminderModalApptId] = useState<string | null>(null);
  const [offerWaitlistAppt, setOfferWaitlistAppt] = useState<AppointmentRecord | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Optimistic sent set so "Enviar próximo" advances instantly even before Firestore snapshot echoes back
  const [optimisticSentIds, setOptimisticSentIds] = useState<Record<string, string>>({});

  // Browser notifications state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const notifiedSessionRef = useRef(false);
  const reminderQueueRef = useRef<HTMLDivElement | null>(null);

  // Drag-and-drop reschedule state
  const [draggingApptId, setDraggingApptId] = useState<string | null>(null);

  // Quick reschedule inside drawer
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState(selectedDate);
  const [reschedStaffId, setReschedStaffId] = useState('');
  const [reschedStartMin, setReschedStartMin] = useState<number | null>(null);

  // Manual new appointment modal
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [newServiceId, setNewServiceId] = useState(services[0]?.id || '');
  const [newStaffId, setNewStaffId] = useState(staff[0]?.id || '');
  const [newDate, setNewDate] = useState(selectedDate);
  const [newStartMinute, setNewStartMinute] = useState<number>(9 * 60);
  const [newClientName, setNewClientName] = useState('');
  const [newClientWhatsapp, setNewClientWhatsapp] = useState('');
  const [newClientNotes, setNewClientNotes] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  const shiftDate = (deltaDays: number) => {
    const d = parseISODateLocal(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(toISODateLocal(d));
  };

  const weekDates = useMemo(() => {
    const base = parseISODateLocal(selectedDate);
    const day = base.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() + mondayOffset, 12, 0, 0);
    return getNextDays(7, monday);
  }, [selectedDate]);

  const filteredAppointments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return appointments.filter((a) => {
      if (statusFilter !== 'todos' && a.status !== statusFilter) return false;
      if (
        q &&
        !a.clientName.toLowerCase().includes(q) &&
        !a.clientWhatsapp.includes(q.replace(/\D/g, '')) &&
        !a.serviceName.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (viewMode === 'semana') {
        return weekDates.includes(a.date);
      }
      return a.date === selectedDate;
    });
  }, [appointments, searchTerm, statusFilter, viewMode, weekDates, selectedDate]);

  // Metrics for selected period (including no-show rate!)
  const metrics = useMemo(() => {
    const active = filteredAppointments.filter((a) => a.status !== 'cancelado');
    const confirmed = active.filter((a) => a.status === 'confirmado' || a.status === 'concluido').length;
    const noShows = filteredAppointments.filter((a) => a.status === 'faltou').length;
    const finalizedOrNoShow = filteredAppointments.filter(
      (a) => a.status === 'concluido' || a.status === 'faltou'
    ).length;
    const noShowRate =
      finalizedOrNoShow > 0 ? Math.round((noShows / finalizedOrNoShow) * 100) : 0;
    const estimatedRevenue = active
      .filter((a) => a.status !== 'faltou')
      .reduce((acc, a) => acc + (a.priceCents || 0), 0);
    return {
      total: active.length,
      confirmed,
      noShows,
      noShowRate,
      estimatedRevenue,
    };
  }, [filteredAppointments]);

  // Empty gaps ("buracos na agenda") for selected day
  const dayGaps = useMemo(() => {
    return staff
      .filter((s) => s.active)
      .flatMap((member) =>
        findScheduleGaps({
          store,
          staff: member,
          date: selectedDate,
          activeLocks: slotLocks,
          minGapMinutes: 45,
        }).map((g) => ({ ...g, staff: member }))
      )
      .slice(0, 4);
  }, [staff, store, selectedDate, slotLocks]);

  // Waitlist entries waiting for selectedDate (or general waiting)
  const activeWaitlist = useMemo(
    () =>
      waitlist.filter(
        (w) => w.status === 'aguardando' && (w.preferredDate === selectedDate || viewMode === 'semana')
      ),
    [waitlist, selectedDate, viewMode]
  );

  // Tomorrow ISO & Reminder Queue calculations
  const todayIso = toISODateLocal(new Date());
  const tomorrowIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODateLocal(d);
  }, []);

  const tomorrowAppointments = useMemo(() => {
    return appointments
      .filter(
        (a) =>
          a.date === tomorrowIso &&
          a.status !== 'cancelado' &&
          a.status !== 'concluido' &&
          a.status !== 'faltou'
      )
      .sort((a, b) => a.startMinute - b.startMinute);
  }, [appointments, tomorrowIso]);

  const isReminderSent = (a: AppointmentRecord) =>
    Boolean(a.reminderSentAt || optimisticSentIds[a.id]);

  const pendingTomorrowReminders = useMemo(
    () => tomorrowAppointments.filter((a) => !isReminderSent(a)),
    [tomorrowAppointments, optimisticSentIds]
  );

  const sentTomorrowCount = tomorrowAppointments.length - pendingTomorrowReminders.length;

  // "Quem pode faltar": unconfirmed tomorrow + unconfirmed today still ahead
  const riskOfNoShowAppointments = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return appointments
      .filter((a) => {
        if (a.status !== 'agendado') return false;
        if (a.reminderResponse === 'confirmou') return false;
        if (a.date === tomorrowIso) return true;
        if (a.date === todayIso && a.startMinute >= nowMin - 15) return true;
        return false;
      })
      .sort((a, b) => (a.date === b.date ? a.startMinute - b.startMinute : a.date.localeCompare(b.date)));
  }, [appointments, todayIso, tomorrowIso]);

  const isImminentUnconfirmed = (a: AppointmentRecord): boolean => {
    if (a.status !== 'agendado' || a.reminderResponse === 'confirmou') return false;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (a.date === todayIso && a.startMinute >= nowMin - 15 && a.startMinute <= nowMin + 240) {
      return true;
    }
    if (a.date === tomorrowIso && !isReminderSent(a)) {
      return true;
    }
    if (a.reminderResponse === 'sem_resposta' || a.reminderResponse === 'pediu_remarcar') {
      return true;
    }
    return false;
  };

  // Scroll to reminder queue if opened via ?painel=admin&aba=lembretes
  useEffect(() => {
    if (initialFocusReminders && reminderQueueRef.current) {
      reminderQueueRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [initialFocusReminders]);

  // Browser notification while panel is open if permission granted and pending reminders exist
  useEffect(() => {
    if (
      notifPermission === 'granted' &&
      pendingTomorrowReminders.length > 0 &&
      !notifiedSessionRef.current &&
      typeof window !== 'undefined' &&
      'Notification' in window
    ) {
      notifiedSessionRef.current = true;
      try {
        new Notification(`${store.name} — Lembretes pendentes`, {
          body: `Você tem ${pendingTomorrowReminders.length} ${
            pendingTomorrowReminders.length === 1
              ? 'cliente de amanhã sem lembrete'
              : 'clientes de amanhã sem lembrete'
          }.`,
        });
      } catch {
        // Ignore browsers blocking Notification constructor without SW
      }
    }
  }, [notifPermission, pendingTomorrowReminders.length, store.name]);

  const handleRequestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        flashNotice('Avisos ativados! Vamos avisar você enquanto o painel estiver aberto.');
      } else if (perm === 'denied') {
        flashNotice('Notificações bloqueadas no navegador. Você pode usar o lembrete diário (.ics).');
      }
    } catch {
      // ignore
    }
  };

  // Keep drawer & reminder modal synced with latest live snapshot
  const liveSelectedAppt = useMemo(
    () => (selectedAppt ? appointments.find((a) => a.id === selectedAppt.id) || selectedAppt : null),
    [selectedAppt, appointments]
  );

  const liveReminderModalAppt = useMemo(
    () =>
      reminderModalApptId
        ? appointments.find((a) => a.id === reminderModalApptId) || null
        : null,
    [reminderModalApptId, appointments]
  );

  const allActiveWaitlist = useMemo(
    () => waitlist.filter((w) => w.status === 'aguardando'),
    [waitlist]
  );

  const openApptDrawer = (appt: AppointmentRecord) => {
    setSelectedAppt(appt);
    setEditingNotes(appt.clientNotes || '');
    setConfirmCancelId(null);
    setRescheduleOpen(false);
    setReschedDate(appt.date);
    setReschedStaffId(appt.staffId);
    setReschedStartMin(null);
  };

  const flashNotice = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3500);
  };

  const handleStatusChange = async (appt: AppointmentRecord, newStatus: AppointmentStatus) => {
    if (newStatus === 'cancelado' && confirmCancelId !== appt.id) {
      setConfirmCancelId(appt.id);
      return;
    }
    setBusyAction(true);
    try {
      await adminUpdateAppointmentStatus(store.storeId, appt, newStatus, store);
      setConfirmCancelId(null);
      flashNotice(
        newStatus === 'cancelado'
          ? 'Agendamento cancelado e horário liberado na agenda.'
          : `Status atualizado para ${STATUS_META[newStatus].label}.`
      );
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Erro ao atualizar status.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleQuickReminderResponse = async (appt: AppointmentRecord, resp: ReminderResponse) => {
    setBusyAction(true);
    try {
      await adminUpdateReminderResponse(store.storeId, appt, resp);
      flashNotice(
        resp === 'confirmou'
          ? 'Confirmado pelo cliente! Status atualizado.'
          : resp === 'pediu_remarcar'
          ? 'Marcado como Pediu remarcar.'
          : 'Marcado como Sem resposta.'
      );
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Erro ao atualizar resposta.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!liveSelectedAppt) return;
    setSavingNotes(true);
    try {
      await adminUpdateAppointmentNotes(store.storeId, liveSelectedAppt.id, editingNotes);
      flashNotice('Observações do cliente salvas.');
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Erro ao salvar observações.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDropToTarget = async (targetDate: string, targetStaffId?: string) => {
    if (!draggingApptId) return;
    const appt = appointments.find((a) => a.id === draggingApptId);
    setDraggingApptId(null);
    if (!appt) return;
    const targetStaff =
      staff.find((s) => s.id === (targetStaffId || appt.staffId)) || staff[0];
    if (!targetStaff) return;
    if (appt.date === targetDate && appt.staffId === targetStaff.id) return;

    setBusyAction(true);
    try {
      const srv = services.find((s) => s.id === appt.serviceId);
      await adminRescheduleAppointment({
        storeId: store.storeId,
        store,
        appointment: appt,
        newStaff: targetStaff,
        newDate: targetDate,
        newStartMinute: appt.startMinute,
        bufferMinutes: srv?.bufferMinutes || 0,
      });
      flashNotice(
        `Remarcado para ${formatDateBR(targetDate, 'short')} às ${minutesToTime(appt.startMinute)} (${targetStaff.name}).`
      );
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Conflito ao mover agendamento.');
    } finally {
      setBusyAction(false);
    }
  };

  const reschedSlots = useMemo(() => {
    if (!rescheduleOpen || !liveSelectedAppt) return [];
    const srv = services.find((s) => s.id === liveSelectedAppt.serviceId) || {
      id: liveSelectedAppt.serviceId,
      storeId: store.storeId,
      name: liveSelectedAppt.serviceName,
      description: '',
      category: '',
      durationMinutes: liveSelectedAppt.durationMinutes,
      priceCents: liveSelectedAppt.priceCents,
      bufferMinutes: 0,
      requiresDeposit: false,
      depositAmountCents: 0,
      returnDays: 0,
      active: true,
      sortOrder: 1,
    };
    return computeAvailableSlots({
      store,
      service: srv,
      staffList: staff,
      selectedStaffId: reschedStaffId || liveSelectedAppt.staffId,
      date: reschedDate,
      activeLocks: slotLocks,
      ignoreAppointmentId: liveSelectedAppt.id,
    });
  }, [rescheduleOpen, liveSelectedAppt, services, store, staff, reschedStaffId, reschedDate, slotLocks]);

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const srv = services.find((s) => s.id === newServiceId) || services[0];
    const member = staff.find((s) => s.id === newStaffId) || staff[0];
    if (!srv || !member) return;
    if (newClientName.trim().length < 2 || !isValidBrazilianPhone(newClientWhatsapp)) {
      flashNotice('Preencha nome e WhatsApp válido do cliente.');
      return;
    }
    setBusyAction(true);
    try {
      await createBookingAtomic({
        store,
        service: srv,
        staff: member,
        date: newDate,
        startMinute: newStartMinute,
        clientName: newClientName,
        clientWhatsapp: newClientWhatsapp,
        clientNotes: newClientNotes,
        lgpdConsent: true,
        initialStatus: 'confirmado',
      });
      setNewBookingOpen(false);
      setNewClientName('');
      setNewClientWhatsapp('');
      setNewClientNotes('');
      flashNotice('Agendamento adicionado à agenda!');
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Erro ao criar agendamento.');
    } finally {
      setBusyAction(false);
    }
  };

  const buildAdminWhatsappLink = (
    appt: AppointmentRecord,
    templateKey: keyof StoreConfig['messageTemplates']
  ) => {
    const link = buildManageBookingUrl(store.storeId, appt.manageToken);
    const text = interpolateTemplate(store.messageTemplates[templateKey], {
      loja: store.name,
      servico: appt.serviceName,
      'serviço': appt.serviceName,
      profissional: appt.staffName,
      data: formatDateBR(appt.date, 'short'),
      hora: minutesToTime(appt.startMinute),
      nome: appt.clientName.split(' ')[0] || appt.clientName,
      cliente: appt.clientName.split(' ')[0] || appt.clientName,
      'dia da semana': getWeekdayNameFromIso(appt.date),
      diaDaSemana: getWeekdayNameFromIso(appt.date),
      link,
      valor: formatCurrencyBRL(appt.priceCents),
      googleReview: store.googleReviewUrl || link,
    });
    return buildWhatsappUrl(appt.clientWhatsapp, text);
  };

  const handleSendNextInQueue = async (appt: AppointmentRecord) => {
    const nowIso = new Date().toISOString();
    setOptimisticSentIds((prev) => ({ ...prev, [appt.id]: nowIso }));
    try {
      await adminRecordReminderSent(store.storeId, appt.id);
      flashNotice(`Lembrete registrado para ${appt.clientName}. Pronto para o próximo!`);
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Erro ao registrar lembrete.');
    }
  };

  const openGapQuickBook = (staffId: string, startMin: number) => {
    setNewServiceId(services[0]?.id || '');
    setNewStaffId(staffId);
    setNewDate(selectedDate);
    setNewStartMinute(startMin);
    setNewBookingOpen(true);
  };

  const renderApptCard = (appt: AppointmentRecord) => {
    const meta = STATUS_META[appt.status];
    const sent = isReminderSent(appt);
    const urgentHighlight = isImminentUnconfirmed(appt);
    const responseMeta = appt.reminderResponse ? RESPONSE_BADGE_META[appt.reminderResponse] : null;

    return (
      <div
        key={appt.id}
        draggable
        onDragStart={() => setDraggingApptId(appt.id)}
        onDragEnd={() => setDraggingApptId(null)}
        onClick={() => openApptDrawer(appt)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openApptDrawer(appt);
        }}
        className={`group p-3.5 rounded-xl border transition-colors cursor-pointer space-y-2 ${
          urgentHighlight
            ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/80 hover:border-amber-500'
            : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical className="w-3.5 h-3.5 text-stone-300 dark:text-stone-700 shrink-0 hidden sm:block" />
            <span className="font-mono-nums text-sm font-semibold text-stone-900 dark:text-stone-100">
              {minutesToTime(appt.startMinute)}
            </span>
            <span className="text-xs text-stone-400">– {minutesToTime(appt.endMinute)}</span>
          </div>
          <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${meta.colorClasses}`}>
            {meta.label}
          </span>
        </div>

        <div>
          <p className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
            {appt.clientName}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {appt.serviceName} · {appt.staffName}
          </p>
        </div>

        {(sent || responseMeta || urgentHighlight) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {sent && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-medium">
                <Check className="w-3 h-3" />
                Lembrete enviado
              </span>
            )}
            {responseMeta && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border font-medium ${responseMeta.classes}`}>
                {responseMeta.label}
              </span>
            )}
            {urgentHighlight && !responseMeta && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100/80 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-medium">
                Sem confirmação
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-stone-100 dark:border-stone-800/80 text-xs">
          <span className="font-mono-nums font-medium text-stone-700 dark:text-stone-300">
            {formatCurrencyBRL(appt.priceCents)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setReminderModalApptId(appt.id);
            }}
            className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold hover:underline py-1 min-h-[32px]"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {sent ? 'Lembrar de novo' : 'Lembrar'}
          </button>
        </div>
      </div>
    );
  };

  const nextPendingClient = pendingTomorrowReminders[0] || null;

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className="p-3.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs sm:text-sm font-medium flex items-center justify-between gap-3">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP REMINDER QUEUE BANNER (FILA DE LEMBRETES PARA AMANHÃ) */}
      {(tomorrowAppointments.length > 0 || initialFocusReminders) && (
        <div
          ref={reminderQueueRef}
          className={`p-4 sm:p-5 rounded-2xl border space-y-3.5 ${
            pendingTomorrowReminders.length > 0
              ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/70'
              : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <h3 className="text-sm sm:text-base font-semibold text-stone-900 dark:text-stone-100">
                  {pendingTomorrowReminders.length > 0
                    ? `Você tem ${pendingTomorrowReminders.length} ${
                        pendingTomorrowReminders.length === 1
                          ? 'cliente de amanhã sem lembrete'
                          : 'clientes de amanhã sem lembrete'
                      }`
                    : tomorrowAppointments.length > 0
                    ? 'Todos os lembretes de amanhã foram enviados!'
                    : 'Nenhum cliente agendado para amanhã ainda'}
                </h3>
              </div>
              {tomorrowAppointments.length > 0 && (
                <p className="text-xs text-stone-600 dark:text-stone-400 font-mono-nums">
                  Fila de amanhã ({formatDateBR(tomorrowIso, 'short')}):{' '}
                  <strong className="text-stone-900 dark:text-stone-100">
                    {sentTomorrowCount} de {tomorrowAppointments.length} enviados
                  </strong>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {nextPendingClient && (
                <a
                  href={buildAdminWhatsappLink(nextPendingClient, 'reminder24h')}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void handleSendNextInQueue(nextPendingClient);
                  }}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-[46px] whitespace-nowrap"
                >
                  <Send className="w-4 h-4" />
                  Enviar próximo ({nextPendingClient.clientName.split(' ')[0]} ·{' '}
                  {minutesToTime(nextPendingClient.startMinute)})
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  downloadDailyOwnerReminderIcs({
                    storeId: store.storeId,
                    storeName: store.name,
                    timeHHMM: store.dailyReminderTime || '18:00',
                  });
                  flashNotice('Lembrete diário (.ics) baixado com alarme embutido!');
                }}
                className="px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px] whitespace-nowrap"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Lembrete diário ({store.dailyReminderTime || '18:00'})
              </button>

              {notifPermission === 'default' && (
                <button
                  type="button"
                  onClick={handleRequestNotificationPermission}
                  className="px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px] whitespace-nowrap"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  Ativar avisos
                </button>
              )}
            </div>
          </div>

          {tomorrowAppointments.length > 0 && (
            <div className="w-full h-1.5 rounded-full bg-stone-200/80 dark:bg-stone-800 overflow-hidden">
              <div
                className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                style={{
                  width: `${Math.round((sentTomorrowCount / tomorrowAppointments.length) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Top Controls: Date Nav, View Mode Switch, New Booking */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-1">
            <button
              type="button"
              onClick={() => shiftDate(viewMode === 'semana' ? -7 : -1)}
              aria-label="Período anterior"
              className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 py-1 text-xs sm:text-sm font-semibold bg-transparent text-stone-900 dark:text-stone-100 font-mono-nums"
            />
            <button
              type="button"
              onClick={() => shiftDate(viewMode === 'semana' ? 7 : 1)}
              aria-label="Próximo período"
              className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedDate(toISODateLocal(new Date()))}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-medium hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[40px]"
          >
            Hoje
          </button>

          <div className="inline-flex p-1 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
            {(
              [
                ['dia', 'Dia'],
                ['semana', 'Semana'],
                ['equipe', 'Por profissional'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setViewMode(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-h-[34px] ${
                  viewMode === k
                    ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewDate(selectedDate);
            setNewServiceId(services[0]?.id || '');
            setNewStaffId(staff[0]?.id || '');
            setNewBookingOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 min-h-[44px] whitespace-nowrap"
          style={{ backgroundColor: store.primaryColor }}
        >
          <Plus className="w-4 h-4" />
          Novo agendamento
        </button>
      </div>

      {/* Period Summary KPIs (Tabular Numerals) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 dark:text-stone-400">Agendados</span>
          <p className="font-mono-nums text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1">
            {metrics.total}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 dark:text-stone-400">Confirmados / Concluídos</span>
          <p className="font-mono-nums text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            {metrics.confirmed}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 dark:text-stone-400">Previsão no período</span>
          <p className="font-mono-nums text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1">
            {formatCurrencyBRL(metrics.estimatedRevenue)}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 dark:text-stone-400">Taxa de faltas</span>
          <p className="font-mono-nums text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1">
            {metrics.noShowRate}%{' '}
            <span className="text-xs font-normal text-stone-500">({metrics.noShows})</span>
          </p>
        </div>
      </div>

      {/* QUEM PODE FALTAR (Unconfirmed for tomorrow & imminent today) */}
      {riskOfNoShowAppointments.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/60 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Quem pode faltar ({riskOfNoShowAppointments.length}{' '}
              {riskOfNoShowAppointments.length === 1 ? 'horário sem confirmação' : 'horários sem confirmação'})
            </div>
          </div>
          <div className="space-y-2">
            {riskOfNoShowAppointments.map((appt) => (
              <div
                key={appt.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-3 rounded-xl bg-white/90 dark:bg-stone-900/90 border border-amber-200/80 dark:border-amber-800/40 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-stone-900 dark:text-stone-100">{appt.clientName}</strong>
                    <span className="font-mono-nums text-stone-600 dark:text-stone-400">
                      {appt.date === todayIso ? 'Hoje' : 'Amanhã'} às {minutesToTime(appt.startMinute)}
                    </span>
                    {appt.reminderResponse && (
                      <span
                        className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${
                          RESPONSE_BADGE_META[appt.reminderResponse].classes
                        }`}
                      >
                        {RESPONSE_BADGE_META[appt.reminderResponse].label}
                      </span>
                    )}
                  </div>
                  <p className="text-stone-500 dark:text-stone-400 truncate">
                    {appt.serviceName} · {appt.staffName}
                    {appt.reminderSentAt
                      ? ` · Lembrete enviado em ${formatDateTimeBR(appt.reminderSentAt)}`
                      : ' · Ainda sem lembrete'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setReminderModalApptId(appt.id)}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 min-h-[38px]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Chamar de novo
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferWaitlistAppt(appt)}
                    className="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 font-semibold inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[38px]"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Oferecer o horário para a lista de espera
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waitlist Alert Banner (if waiting clients exist) */}
      {activeWaitlist.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <BellRing className="w-4 h-4 shrink-0" />
            Lista de espera ativa ({activeWaitlist.length}{' '}
            {activeWaitlist.length === 1 ? 'cliente aguardando' : 'clientes aguardando'})
          </div>
          <div className="space-y-2">
            {activeWaitlist.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-white/80 dark:bg-stone-900/80 border border-amber-200/70 dark:border-amber-800/40 text-xs"
              >
                <div>
                  <strong className="text-stone-900 dark:text-stone-100">{entry.clientName}</strong> ·{' '}
                  {entry.serviceName} · {formatDateBR(entry.preferredDate, 'short')} (
                  {entry.preferredPeriod})
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={buildWhatsappUrl(
                      entry.clientWhatsapp,
                      `Oi, ${entry.clientName.split(' ')[0]}! Abriu uma vaga na ${store.name} para ${entry.serviceName} em ${formatDateBR(entry.preferredDate, 'short')}. Quer aproveitar o encaixe?`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => adminUpdateWaitlistStatus(store.storeId, entry.id, 'notificado')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center gap-1 min-h-[34px]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Chamar encaixe
                  </a>
                  <button
                    type="button"
                    onClick={() => adminUpdateWaitlistStatus(store.storeId, entry.id, 'removido')}
                    className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 min-h-[34px]"
                  >
                    Dispensar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Status Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome do cliente, WhatsApp ou serviço..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'todos')}
          className="px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-sm text-stone-700 dark:text-stone-200 min-h-[44px]"
        >
          <option value="todos">Todos os status</option>
          {(Object.keys(STATUS_META) as AppointmentStatus[]).map((st) => (
            <option key={st} value={st}>
              {STATUS_META[st].label}
            </option>
          ))}
        </select>
      </div>

      {/* Empty Schedule Gaps ("Horários vazios / Buracos na agenda") */}
      {viewMode !== 'semana' && dayGaps.length > 0 && (
        <div className="p-4 rounded-xl bg-stone-100/80 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: store.primaryColor }} />
            <span>
              <strong className="text-stone-900 dark:text-stone-100">Buracos livres em {formatDateBR(selectedDate, 'short')}:</strong>{' '}
              clique para encaixar rápido
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {dayGaps.map((g, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => openGapQuickBook(g.staff.id, g.startMinute)}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-mono-nums hover:border-stone-400 transition-colors"
              >
                {minutesToTime(g.startMinute)}–{minutesToTime(g.endMinute)} · {g.staff.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 1: DAY VIEW */}
      {viewMode === 'dia' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-stone-600 dark:text-stone-400 capitalize">
            {formatDateBR(selectedDate, 'long')} · {filteredAppointments.length} registro(s)
          </h3>
          {filteredAppointments.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-center space-y-3">
              <Calendar className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-700" />
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Nenhum agendamento para este dia
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Compartilhe seu link público ou cadastre um encaixe manual acima.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredAppointments.map(renderApptCard)}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: WEEK VIEW (Drag-and-drop between days!) */}
      {viewMode === 'semana' && (
        <div className="space-y-2">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Dica: arraste um agendamento para outra coluna de dia para remarcar mantendo o horário.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
            {weekDates.map((iso) => {
              const items = filteredAppointments.filter((a) => a.date === iso);
              const isToday = iso === toISODateLocal(new Date());
              return (
                <div
                  key={iso}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropToTarget(iso)}
                  className={`p-3 rounded-xl border min-h-[200px] space-y-2.5 ${
                    isToday
                      ? 'bg-stone-100/70 dark:bg-stone-900 border-stone-400 dark:border-stone-600'
                      : 'bg-white dark:bg-stone-900/60 border-stone-200 dark:border-stone-800'
                  }`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-stone-200/70 dark:border-stone-800">
                    <span className="text-xs font-semibold capitalize text-stone-900 dark:text-stone-100">
                      {formatDateBR(iso, 'weekday')}
                    </span>
                    <span className="font-mono-nums text-[11px] text-stone-500">{items.length}</span>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-[11px] text-stone-400 py-6 text-center">Livre</p>
                  ) : (
                    items.map(renderApptCard)
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: BY STAFF (Drag-and-drop between professionals!) */}
      {viewMode === 'equipe' && (
        <div className="space-y-2">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Arraste um agendamento para transferir para outro profissional em {formatDateBR(selectedDate, 'short')}.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {staff.map((member) => {
              const items = filteredAppointments.filter((a) => a.staffId === member.id);
              return (
                <div
                  key={member.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropToTarget(selectedDate, member.id)}
                  className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3 min-h-[240px]"
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-stone-100 dark:border-stone-800">
                    <div>
                      <h4 className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                        {member.name}
                      </h4>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">{member.role}</p>
                    </div>
                    <span className="font-mono-nums text-xs font-semibold text-stone-600 dark:text-stone-400">
                      {items.length} atend.
                    </span>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-stone-400 py-8 text-center">Agenda livre hoje</p>
                  ) : (
                    <div className="space-y-2.5">{items.map(renderApptCard)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* APPOINTMENT DETAIL DRAWER */}
      {liveSelectedAppt && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 w-full max-w-md h-full overflow-y-auto p-6 space-y-6">
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 dark:border-stone-800 pb-4">
              <div>
                <p className="text-xs text-stone-500 dark:text-stone-400 font-mono-nums">
                  {formatDateBR(liveSelectedAppt.date, 'weekday')} ·{' '}
                  {minutesToTime(liveSelectedAppt.startMinute)}–
                  {minutesToTime(liveSelectedAppt.endMinute)}
                </p>
                <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mt-0.5">
                  {liveSelectedAppt.clientName}
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 font-mono-nums mt-0.5">
                  {formatBrazilianPhoneInput(liveSelectedAppt.clientWhatsapp)}
                  {liveSelectedAppt.clientEmail ? ` · ${liveSelectedAppt.clientEmail}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppt(null)}
                aria-label="Fechar detalhes"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Service summary */}
            <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/60 space-y-1 text-sm">
              <div className="font-semibold text-stone-900 dark:text-stone-100">
                {liveSelectedAppt.serviceName}
              </div>
              <div className="text-xs text-stone-600 dark:text-stone-400">
                Profissional: {liveSelectedAppt.staffName} · {liveSelectedAppt.durationMinutes} min ·{' '}
                <strong className="font-mono-nums text-stone-900 dark:text-stone-100">
                  {formatCurrencyBRL(liveSelectedAppt.priceCents)}
                </strong>
              </div>
            </div>

            {/* Status Switcher */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                Status do atendimento
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(STATUS_META) as AppointmentStatus[]).map((st) => {
                  const isCurrent = liveSelectedAppt.status === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={busyAction}
                      onClick={() => handleStatusChange(liveSelectedAppt, st)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all min-h-[40px] ${
                        isCurrent
                          ? STATUS_META[st].colorClasses + ' ring-2 ring-stone-900/20 dark:ring-white/20'
                          : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      {STATUS_META[st].label}
                    </button>
                  );
                })}
              </div>
              {confirmCancelId === liveSelectedAppt.id && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2">
                  <p className="text-xs font-medium text-rose-800 dark:text-rose-200">
                    Confirmar cancelamento? O horário voltará a ficar livre.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmCancelId(null)}
                      className="flex-1 py-2 rounded-lg bg-white dark:bg-stone-900 text-xs font-medium border border-stone-200 dark:border-stone-700"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(liveSelectedAppt, 'cancelado')}
                      className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold"
                    >
                      Sim, cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 1-Tap Reminder & Response Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                  Lembretes e confirmação
                </label>
                {liveSelectedAppt.reminderSentAt && (
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Enviado em {formatDateTimeBR(liveSelectedAppt.reminderSentAt)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setReminderModalApptId(liveSelectedAppt.id)}
                className="w-full py-3 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 min-h-[46px]"
              >
                <MessageCircle className="w-4 h-4" />
                {isReminderSent(liveSelectedAppt)
                  ? 'Lembrar de novo / Agendar aviso'
                  : 'Lembrar cliente (WhatsApp ou Calendário)'}
              </button>

              {/* 1-tap client response buttons */}
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['confirmou', 'Confirmou', <CheckCircle2 key="c" className="w-3.5 h-3.5" />],
                    ['pediu_remarcar', 'Pediu remarcar', <RefreshCw key="r" className="w-3.5 h-3.5" />],
                    ['sem_resposta', 'Sem resposta', <HelpCircle key="s" className="w-3.5 h-3.5" />],
                  ] as const
                ).map(([resp, lbl, icon]) => {
                  const active = liveSelectedAppt.reminderResponse === resp;
                  return (
                    <button
                      key={resp}
                      type="button"
                      disabled={busyAction}
                      onClick={() => handleQuickReminderResponse(liveSelectedAppt, resp)}
                      className={`py-2 px-2 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1 min-h-[40px] ${
                        active
                          ? RESPONSE_BADGE_META[resp].classes + ' ring-1 ring-stone-900/15'
                          : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      {icon}
                      <span className="truncate">{lbl}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={buildAdminWhatsappLink(liveSelectedAppt, 'reminder2h')}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void adminRecordReminderSent(store.storeId, liveSelectedAppt.id);
                  }}
                  className="py-2.5 px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[42px]"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Lembrete 2h
                </a>
                <a
                  href={buildAdminWhatsappLink(liveSelectedAppt, 'postVisitReview')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[42px]"
                >
                  Pedir avaliação
                </a>
              </div>
            </div>

            {/* Quick Pix Copy */}
            {store.pixKey && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    const amount =
                      liveSelectedAppt.depositAmountCents > 0
                        ? liveSelectedAppt.depositAmountCents
                        : liveSelectedAppt.priceCents;
                    const code = generatePixBrCode({
                      pixKey: store.pixKey,
                      merchantName: store.pixMerchantName || store.name,
                      merchantCity: store.pixMerchantCity || 'SAO PAULO',
                      amountCents: amount,
                      txid: liveSelectedAppt.id.slice(0, 12),
                    });
                    await navigator.clipboard.writeText(code);
                    setCopiedPix(true);
                    setTimeout(() => setCopiedPix(false), 2000);
                  }}
                  className="w-full py-2.5 px-3.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px]"
                >
                  {copiedPix ? <Check className="w-4 h-4 text-emerald-600" /> : <QrCode className="w-4 h-4" />}
                  {copiedPix
                    ? 'Pix copia e cola copiado!'
                    : `Copiar Pix (${formatCurrencyBRL(
                        liveSelectedAppt.depositAmountCents > 0
                          ? liveSelectedAppt.depositAmountCents
                          : liveSelectedAppt.priceCents
                      )})`}
                </button>
              </div>
            )}

            {/* Quick Reschedule Section */}
            <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setRescheduleOpen((v) => !v)}
                className="w-full py-2.5 px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[42px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {rescheduleOpen ? 'Fechar remarcação' : 'Remarcar data / profissional'}
              </button>

              {rescheduleOpen && (
                <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={reschedDate}
                      onChange={(e) => {
                        setReschedDate(e.target.value);
                        setReschedStartMin(null);
                      }}
                      className="px-2.5 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono-nums"
                    />
                    <select
                      value={reschedStaffId}
                      onChange={(e) => {
                        setReschedStaffId(e.target.value);
                        setReschedStartMin(null);
                      }}
                      className="px-2.5 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
                    >
                      {staff.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 max-h-36 overflow-y-auto">
                    {reschedSlots.map((slot) => (
                      <button
                        key={slot.startMinute}
                        type="button"
                        onClick={() => setReschedStartMin(slot.startMinute)}
                        className={`py-1.5 rounded-lg border text-xs font-mono-nums ${
                          reschedStartMin === slot.startMinute
                            ? 'text-white border-transparent'
                            : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700'
                        }`}
                        style={
                          reschedStartMin === slot.startMinute
                            ? { backgroundColor: store.primaryColor }
                            : undefined
                        }
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={reschedStartMin === null || busyAction}
                    onClick={async () => {
                      if (reschedStartMin === null) return;
                      const member = staff.find((m) => m.id === reschedStaffId) || staff[0];
                      const srv = services.find((s) => s.id === liveSelectedAppt.serviceId);
                      if (!member) return;
                      setBusyAction(true);
                      try {
                        await adminRescheduleAppointment({
                          storeId: store.storeId,
                          store,
                          appointment: liveSelectedAppt,
                          newStaff: member,
                          newDate: reschedDate,
                          newStartMinute: reschedStartMin,
                          bufferMinutes: srv?.bufferMinutes || 0,
                        });
                        setRescheduleOpen(false);
                        flashNotice('Horário remarcado com sucesso.');
                      } catch (err) {
                        flashNotice(err instanceof Error ? err.message : 'Erro ao remarcar.');
                      } finally {
                        setBusyAction(false);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl text-white text-xs font-semibold disabled:opacity-40"
                    style={{ backgroundColor: store.primaryColor }}
                  >
                    Salvar novo horário
                  </button>
                </div>
              )}
            </div>

            {/* Client Quick Notes (Allergies / Preferences) */}
            <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <label className="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5" />
                Ficha rápida (alergias, preferências, observações)
              </label>
              <textarea
                rows={3}
                maxLength={400}
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                placeholder="Ex: prefere água morna, alergia a produto X..."
                className="w-full p-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs"
              />
              <button
                type="button"
                disabled={savingNotes}
                onClick={handleSaveNotes}
                className="px-4 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-semibold min-h-[38px]"
              >
                {savingNotes ? 'Salvando...' : 'Salvar observação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL NEW BOOKING MODAL */}
      {newBookingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                Novo agendamento manual
              </h3>
              <button
                type="button"
                onClick={() => setNewBookingOpen(false)}
                className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleManualCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Serviço</label>
                <select
                  value={newServiceId}
                  onChange={(e) => setNewServiceId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min · {formatCurrencyBRL(s.priceCents)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Profissional</label>
                <select
                  value={newStaffId}
                  onChange={(e) => setNewStaffId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                >
                  {staff.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Horário</label>
                  <select
                    value={newStartMinute}
                    onChange={(e) => setNewStartMinute(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                  >
                    {Array.from({ length: 56 }, (_, i) => 7 * 60 + i * 15).map((m) => (
                      <option key={m} value={m}>
                        {minutesToTime(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Nome do cliente *</label>
                <input
                  type="text"
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">WhatsApp *</label>
                <input
                  type="tel"
                  required
                  value={newClientWhatsapp}
                  onChange={(e) => setNewClientWhatsapp(formatBrazilianPhoneInput(e.target.value))}
                  placeholder="(11) 99999-8888"
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Observações</label>
                <input
                  type="text"
                  value={newClientNotes}
                  onChange={(e) => setNewClientNotes(e.target.value)}
                  placeholder="Preferências ou alergias"
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busyAction}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold min-h-[48px] disabled:opacity-50"
                style={{ backgroundColor: store.primaryColor }}
              >
                {busyAction ? 'Salvando...' : 'Salvar na agenda'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* REMINDER MODAL */}
      <ReminderModal
        open={Boolean(liveReminderModalAppt)}
        store={store}
        appointment={liveReminderModalAppt}
        onClose={() => setReminderModalApptId(null)}
        onFeedback={(msg) => flashNotice(msg)}
      />

      {/* OFFER SLOT TO WAITLIST MODAL */}
      {offerWaitlistAppt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Oferecer horário para a lista de espera"
        >
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                  Oferecer horário para a lista de espera
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Vaga de {offerWaitlistAppt.serviceName} em {formatDateBR(offerWaitlistAppt.date, 'short')}{' '}
                  às {minutesToTime(offerWaitlistAppt.startMinute)} ({offerWaitlistAppt.staffName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOfferWaitlistAppt(null)}
                className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {allActiveWaitlist.length === 0 ? (
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/60 text-xs text-stone-600 dark:text-stone-400 space-y-3">
                <p>
                  Ainda não há clientes aguardando na lista de espera. Você pode copiar uma mensagem
                  pronta de encaixe relâmpago para enviar nos seus status ou contatos:
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const promoMsg = `Olá! Temos uma vaga de encaixe na ${store.name} em ${formatDateBR(
                      offerWaitlistAppt.date,
                      'short'
                    )} às ${minutesToTime(offerWaitlistAppt.startMinute)} (${
                      offerWaitlistAppt.serviceName
                    } com ${offerWaitlistAppt.staffName}). Quer garantir este horário?`;
                    await navigator.clipboard.writeText(promoMsg);
                    flashNotice('Mensagem de encaixe copiada!');
                    setOfferWaitlistAppt(null);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold min-h-[42px]"
                >
                  Copiar mensagem de encaixe
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {allActiveWaitlist.map((entry) => {
                  const offerMsg = `Olá, ${
                    entry.clientName.split(' ')[0]
                  }! Surgiu uma possível vaga na ${store.name} para ${
                    offerWaitlistAppt.serviceName
                  } com ${offerWaitlistAppt.staffName} em ${formatDateBR(
                    offerWaitlistAppt.date,
                    'short'
                  )} às ${minutesToTime(
                    offerWaitlistAppt.startMinute
                  )}. Você tem interesse neste encaixe?`;
                  return (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {entry.clientName}
                        </p>
                        <p className="text-stone-500 dark:text-stone-400 truncate">
                          {entry.serviceName} · Prefere {formatDateBR(entry.preferredDate, 'short')} (
                          {entry.preferredPeriod})
                        </p>
                      </div>
                      <a
                        href={buildWhatsappUrl(entry.clientWhatsapp, offerMsg)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          void adminUpdateWaitlistStatus(store.storeId, entry.id, 'notificado');
                          flashNotice(`Vaga oferecida para ${entry.clientName}.`);
                        }}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 shrink-0 min-h-[38px]"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Oferecer
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
