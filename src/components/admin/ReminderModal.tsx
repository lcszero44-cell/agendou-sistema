import React, { useMemo, useState } from 'react';
import {
  Bell,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  HelpCircle,
  MessageCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  buildIndividualReminderGoogleCalUrl,
  buildManageBookingUrl,
  buildWhatsappUrl,
  computeReminderDateTime,
  downloadDailyOwnerReminderIcs,
  downloadIndividualReminderIcs,
  formatBrazilianPhoneInput,
  formatCurrencyBRL,
  formatDateBR,
  formatDateTimeBR,
  getWeekdayNameFromIso,
  interpolateTemplate,
  minutesToTime,
} from '../../lib/brUtils';
import {
  adminRecordReminderSent,
  adminUpdateReminderResponse,
} from '../../lib/storeRepository';
import {
  AppointmentRecord,
  ReminderResponse,
  StoreConfig,
} from '../../types/booking';

interface ReminderModalProps {
  open: boolean;
  store: StoreConfig;
  appointment: AppointmentRecord | null;
  onClose: () => void;
  onFeedback?: (msg: string) => void;
}

export const ReminderModal: React.FC<ReminderModalProps> = ({
  open,
  store,
  appointment,
  onClose,
  onFeedback,
}) => {
  const [templateMode, setTemplateMode] = useState<'reminder24h' | 'reminder2h' | 'postVisitReview'>(
    'reminder24h'
  );
  const [confirmResend, setConfirmResend] = useState(false);
  const [showIndividualCalendar, setShowIndividualCalendar] = useState(false);
  const [whenMode, setWhenMode] = useState<'24h' | '2h' | 'custom'>('24h');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState(store.dailyReminderTime || '18:00');
  const [savingResponse, setSavingResponse] = useState(false);
  const [localSentAt, setLocalSentAt] = useState<string | null>(null);

  React.useEffect(() => {
    if (open && appointment) {
      setTemplateMode('reminder24h');
      setConfirmResend(false);
      setShowIndividualCalendar(false);
      setWhenMode('24h');
      const computed24 = computeReminderDateTime({
        appointmentDate: appointment.date,
        appointmentStartMinute: appointment.startMinute,
        mode: '24h',
      });
      setCustomDate(computed24.date);
      setCustomTime(store.dailyReminderTime || '18:00');
      setLocalSentAt(appointment.reminderSentAt || null);
    }
  }, [open, appointment?.id, store.dailyReminderTime]);

  const readyMessage = useMemo(() => {
    if (!appointment) return '';
    const link = buildManageBookingUrl(store.storeId, appointment.manageToken);
    const tpl =
      store.messageTemplates[templateMode] ||
      'Olá, [nome]! Passando para lembrar do seu horário de [serviço] com [profissional], [dia da semana], [data] às [hora], na [loja]. Responda 1 para confirmar ou 2 para remarcar. Obrigado!';
    return interpolateTemplate(tpl, {
      nome: appointment.clientName.split(' ')[0] || appointment.clientName,
      cliente: appointment.clientName.split(' ')[0] || appointment.clientName,
      'serviço': appointment.serviceName,
      servico: appointment.serviceName,
      profissional: appointment.staffName,
      'dia da semana': getWeekdayNameFromIso(appointment.date),
      diaDaSemana: getWeekdayNameFromIso(appointment.date),
      data: formatDateBR(appointment.date, 'short'),
      hora: minutesToTime(appointment.startMinute),
      loja: store.name,
      link,
      valor: formatCurrencyBRL(appointment.priceCents),
      googleReview: store.googleReviewUrl || link,
    });
  }, [appointment, store, templateMode]);

  const reminderDateTime = useMemo(() => {
    if (!appointment) return { date: '', startMinute: 18 * 60 };
    return computeReminderDateTime({
      appointmentDate: appointment.date,
      appointmentStartMinute: appointment.startMinute,
      mode: whenMode,
      customDate,
      customTime,
    });
  }, [appointment, whenMode, customDate, customTime]);

  if (!open || !appointment) return null;

  const sentAtValue = localSentAt || appointment.reminderSentAt || '';
  const alreadySent = Boolean(sentAtValue);
  const waUrl = buildWhatsappUrl(appointment.clientWhatsapp, readyMessage);

  const googleCalIndividualUrl = buildIndividualReminderGoogleCalUrl({
    clientName: appointment.clientName,
    clientWhatsapp: appointment.clientWhatsapp,
    serviceName: appointment.serviceName,
    appointmentDate: appointment.date,
    appointmentStartMinute: appointment.startMinute,
    reminderDate: reminderDateTime.date,
    reminderStartMinute: reminderDateTime.startMinute,
    readyMessage,
    storeName: store.name,
  });

  const handleRecordSent = async () => {
    try {
      const iso = await adminRecordReminderSent(store.storeId, appointment.id);
      setLocalSentAt(iso);
      setConfirmResend(false);
      onFeedback?.(`Lembrete registrado para ${appointment.clientName}.`);
    } catch (err) {
      onFeedback?.(err instanceof Error ? err.message : 'Erro ao registrar envio do lembrete.');
    }
  };

  const handleSetResponse = async (response: ReminderResponse) => {
    setSavingResponse(true);
    try {
      await adminUpdateReminderResponse(store.storeId, appointment, response);
      const labelMap: Record<ReminderResponse, string> = {
        '': 'Resposta limpa.',
        confirmou: 'Marcado como Confirmou (status atualizado para Confirmado).',
        pediu_remarcar: 'Marcado como Pediu remarcar.',
        sem_resposta: 'Marcado como Sem resposta.',
      };
      onFeedback?.(labelMap[response]);
    } catch (err) {
      onFeedback?.(err instanceof Error ? err.message : 'Erro ao salvar resposta.');
    } finally {
      setSavingResponse(false);
    }
  };

  const handleDownloadIndividualIcs = () => {
    downloadIndividualReminderIcs({
      appointmentId: appointment.id,
      clientName: appointment.clientName,
      clientWhatsapp: appointment.clientWhatsapp,
      serviceName: appointment.serviceName,
      appointmentDate: appointment.date,
      appointmentStartMinute: appointment.startMinute,
      reminderDate: reminderDateTime.date,
      reminderStartMinute: reminderDateTime.startMinute,
      readyMessage,
      storeName: store.name,
    });
    onFeedback?.('Arquivo de calendário (.ics) baixado com alarme embutido.');
  };

  const handleDownloadDailyIcs = () => {
    downloadDailyOwnerReminderIcs({
      storeId: store.storeId,
      storeName: store.name,
      timeHHMM: store.dailyReminderTime || '18:00',
    });
    onFeedback?.('Lembrete diário (.ics) baixado! Importe no calendário do seu celular.');
  };

  const responseButtons: {
    value: ReminderResponse;
    label: string;
    icon: React.ReactNode;
    activeClass: string;
  }[] = [
    {
      value: 'confirmou',
      label: 'Confirmou',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      activeClass:
        'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-600 dark:border-emerald-500',
    },
    {
      value: 'pediu_remarcar',
      label: 'Pediu remarcar',
      icon: <RefreshCw className="w-3.5 h-3.5" />,
      activeClass:
        'bg-amber-600 text-white border-amber-600 dark:bg-amber-600 dark:border-amber-500',
    },
    {
      value: 'sem_resposta',
      label: 'Sem resposta',
      icon: <HelpCircle className="w-3.5 h-3.5" />,
      activeClass:
        'bg-rose-600 text-white border-rose-600 dark:bg-rose-600 dark:border-rose-500',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Lembrete para o cliente"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 dark:border-stone-800 pb-3.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-stone-500 dark:text-stone-400 capitalize">
              {getWeekdayNameFromIso(appointment.date)}, {formatDateBR(appointment.date, 'short')} às{' '}
              <span className="font-mono-nums font-semibold text-stone-900 dark:text-stone-100">
                {minutesToTime(appointment.startMinute)}
              </span>
            </p>
            <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 truncate mt-0.5">
              Lembrar {appointment.clientName}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
              {appointment.serviceName} · {appointment.staffName} ·{' '}
              <span className="font-mono-nums">
                {formatBrazilianPhoneInput(appointment.clientWhatsapp)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de lembrete"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sent status badge */}
        {alreadySent && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
            <Check className="w-4 h-4 shrink-0" />
            <span>Lembrete enviado em {formatDateTimeBR(sentAtValue)}</span>
          </div>
        )}

        {/* ACTION A: SEND NOW ON WHATSAPP */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              1. Enviar agora no WhatsApp
            </span>
            <div className="flex items-center gap-1">
              {(
                [
                  ['reminder24h', '24h'],
                  ['reminder2h', '2h'],
                  ['postVisitReview', 'Avaliação'],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTemplateMode(k)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    templateMode === k
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300 whitespace-pre-line leading-relaxed">
            {readyMessage}
          </div>

          {!alreadySent ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                void handleRecordSent();
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors min-h-[48px]"
            >
              <MessageCircle className="w-4 h-4" />
              Enviar lembrete agora no WhatsApp
            </a>
          ) : !confirmResend ? (
            <button
              type="button"
              onClick={() => setConfirmResend(true)}
              className="w-full py-3.5 px-4 rounded-xl border border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-sm font-semibold flex items-center justify-center gap-2 transition-colors min-h-[48px]"
            >
              <MessageCircle className="w-4 h-4" />
              Lembrar de novo
            </button>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2.5">
              <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                Lembrete já enviado em {formatDateTimeBR(sentAtValue)}. Deseja enviar novamente pelo
                WhatsApp?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmResend(false)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium min-h-[42px]"
                >
                  Cancelar
                </button>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void handleRecordSent();
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[42px]"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Sim, enviar de novo
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ONE-TAP RESPONSE STATUS */}
        <div className="space-y-2 pt-3 border-t border-stone-100 dark:border-stone-800">
          <span className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
            Resposta do cliente (1 toque)
          </span>
          <div className="grid grid-cols-3 gap-2">
            {responseButtons.map((btn) => {
              const isSelected = appointment.reminderResponse === btn.value;
              return (
                <button
                  key={btn.value}
                  type="button"
                  disabled={savingResponse}
                  onClick={() => handleSetResponse(btn.value)}
                  className={`py-2.5 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors min-h-[44px] ${
                    isSelected
                      ? btn.activeClass
                      : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                  }`}
                >
                  {btn.icon}
                  <span className="truncate">{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ACTION B: ME AVISAR DEPOIS (CALENDAR REMINDER) */}
        <div className="space-y-3 pt-3 border-t border-stone-100 dark:border-stone-800">
          <span className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
            2. Me avisar depois (no meu calendário)
          </span>

          {/* Primary Recommended Option: Daily Reminder */}
          <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <Bell className="w-4 h-4 text-stone-700 dark:text-stone-300 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                  Opção principal: Lembrete diário às {store.dailyReminderTime || '18:00'}
                </p>
                <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                  Um único alarme diário no seu calendário para abrir a fila e avisar todos os
                  clientes de amanhã, sem lotar sua agenda pessoal.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadDailyIcs}
              className="w-full py-2.5 px-3.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-semibold flex items-center justify-center gap-2 min-h-[44px]"
            >
              <CalendarPlus className="w-4 h-4" />
              Criar lembrete diário no meu calendário (.ics)
            </button>
          </div>

          {/* Secondary Option: Individual Reminder for this Client */}
          <button
            type="button"
            onClick={() => setShowIndividualCalendar((v) => !v)}
            className="w-full py-2.5 px-3.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center justify-center gap-2 min-h-[42px]"
          >
            <Clock className="w-3.5 h-3.5" />
            {showIndividualCalendar
              ? 'Ocultar lembrete individual'
              : 'Prefiro um lembrete separado só para este cliente'}
          </button>

          {showIndividualCalendar && (
            <div className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 space-y-3">
              <p className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Quando deseja ser avisado(a)?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['24h', '24h antes'],
                    ['2h', '2h antes'],
                    ['custom', 'Personalizar'],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setWhenMode(k)}
                    className={`py-2 px-2 rounded-xl border text-xs font-semibold min-h-[40px] ${
                      whenMode === k
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-transparent'
                        : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {whenMode === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="px-2.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs font-mono-nums"
                  />
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="px-2.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs font-mono-nums"
                  />
                </div>
              )}

              <p className="text-[11px] text-stone-500 dark:text-stone-400 font-mono-nums">
                Alarme agendado para: {formatDateBR(reminderDateTime.date, 'short')} às{' '}
                {minutesToTime(reminderDateTime.startMinute)}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadIndividualIcs}
                  className="py-2.5 px-3 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px]"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar .ics (com alarme)
                </button>
                <a
                  href={googleCalIndividualUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px]"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Adicionar ao Google Agenda
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
