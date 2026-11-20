import React, { useMemo, useState } from 'react';
import { Bell, CalendarPlus, Check, Copy, Plus, QrCode, Save, Send, Star, Webhook, X } from 'lucide-react';
import { SEGMENT_TEMPLATES } from '../../config/segmentTemplates';
import {
  downloadDailyOwnerReminderIcs,
  formatBrazilianPhoneInput,
  formatDateBR,
  generatePixBrCode,
  getDayLabelFull,
} from '../../lib/brUtils';
import { updateStoreConfig } from '../../lib/storeRepository';
import { ReviewItem, SegmentKey, StoreConfig } from '../../types/booking';

const buildEditableReviews = (reviews?: ReviewItem[]): ReviewItem[] => {
  const base = Array.isArray(reviews) ? reviews.slice(0, 3) : [];
  const padded = [...base];
  while (padded.length < 3) {
    padded.push({
      author: '',
      role: '',
      rating: 5,
      comment: '',
      date: '',
    });
  }
  return padded;
};

interface AdminSettingsTabProps {
  store: StoreConfig;
}

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({ store }) => {
  const [section, setSection] = useState<'loja' | 'horarios' | 'pix' | 'mensagens'>('loja');
  const [draft, setDraft] = useState<StoreConfig>({
    ...store,
    showReviews: store.showReviews !== false,
    reviews: buildEditableReviews(store.reviews),
    dailyReminderTime: store.dailyReminderTime || '18:00',
    automationWebhookUrl: store.automationWebhookUrl || '',
  });
  const [whatsappInput, setWhatsappInput] = useState(formatBrazilianPhoneInput(store.whatsapp));
  const [newHoliday, setNewHoliday] = useState('');
  const [newBlocked, setNewBlocked] = useState('');
  const [newBadge, setNewBadge] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedTestPix, setCopiedTestPix] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);

  React.useEffect(() => {
    setDraft({
      ...store,
      showReviews: store.showReviews !== false,
      reviews: buildEditableReviews(store.reviews),
      dailyReminderTime: store.dailyReminderTime || '18:00',
      automationWebhookUrl: store.automationWebhookUrl || '',
    });
    setWhatsappInput(formatBrazilianPhoneInput(store.whatsapp));
    setSaveError(null);
  }, [store.storeId]);

  const pixPreview = useMemo(() => {
    if (!draft.pixKey) return '';
    return generatePixBrCode({
      pixKey: draft.pixKey,
      merchantName: draft.pixMerchantName || draft.name,
      merchantCity: draft.pixMerchantCity || 'SAO PAULO',
      amountCents: 5000,
      txid: 'TESTE01',
    });
  }, [draft.pixKey, draft.pixMerchantName, draft.pixMerchantCity, draft.name]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await updateStoreConfig({
        ...draft,
        whatsapp: whatsappInput,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2600);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Configurações da loja
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Personalize dados públicos, horários, bloqueios, sinal via Pix e mensagens do WhatsApp.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-[44px] whitespace-nowrap disabled:opacity-50"
          style={{ backgroundColor: draft.primaryColor }}
        >
          {savedNotice ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Salvando...' : savedNotice ? 'Alterações salvas!' : 'Salvar configurações'}
        </button>
      </div>

      {saveError && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
          {saveError}
        </div>
      )}

      {/* Sub-navigation tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-x-auto no-scrollbar">
        {(
          [
            ['loja', 'Loja e Visual'],
            ['horarios', 'Horários e Feriados'],
            ['pix', 'Pix Copia e Cola'],
            ['mensagens', 'Lembretes e Automação'],
          ] as const
        ).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSection(k)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
              section === k
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* SECTION 1: LOJA E VISUAL */}
      {section === 'loja' && (
        <div className="space-y-6">
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Nome da loja *</label>
              <input
                type="text"
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Segmento</label>
              <select
                value={draft.segment}
                onChange={(e) => setDraft({ ...draft, segment: e.target.value as SegmentKey })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              >
                {(Object.keys(SEGMENT_TEMPLATES) as SegmentKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SEGMENT_TEMPLATES[key].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                WhatsApp oficial da loja *
              </label>
              <input
                type="tel"
                required
                value={whatsappInput}
                onChange={(e) => setWhatsappInput(formatBrazilianPhoneInput(e.target.value))}
                placeholder="(11) 99999-8888"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Cor principal da marca
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={draft.primaryColor}
                  onChange={(e) =>
                    setDraft({ ...draft, primaryColor: e.target.value, accentColor: e.target.value })
                  }
                  className="w-12 h-11 rounded-xl border border-stone-300 dark:border-stone-700 cursor-pointer p-1 bg-white dark:bg-stone-950"
                />
                <input
                  type="text"
                  value={draft.primaryColor}
                  onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Título principal (Hero)</label>
            <input
              type="text"
              maxLength={120}
              value={draft.heroTitle}
              onChange={(e) => setDraft({ ...draft, heroTitle: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Subtítulo</label>
            <textarea
              rows={2}
              maxLength={260}
              value={draft.heroSubtitle}
              onChange={(e) => setDraft({ ...draft, heroSubtitle: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Endereço completo</label>
              <input
                type="text"
                maxLength={220}
                value={draft.address}
                onChange={(e) =>
                  setDraft({ ...draft, address: e.target.value, mapsQuery: e.target.value })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Link de avaliação no Google
              </label>
              <input
                type="url"
                maxLength={300}
                value={draft.googleReviewUrl}
                onChange={(e) => setDraft({ ...draft, googleReviewUrl: e.target.value })}
                placeholder="https://g.page/r/sua-loja/review"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              />
            </div>
          </div>

          {/* Editable Trust Badges */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-stone-500">
              Selos de confiança (aparecem na página pública, máx. 6)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={60}
                value={newBadge}
                onChange={(e) => setNewBadge(e.target.value)}
                placeholder="Ex: Estacionamento gratuito"
                className="flex-1 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  if (newBadge.trim() && draft.trustBadges.length < 6) {
                    setDraft({ ...draft, trustBadges: [...draft.trustBadges, newBadge.trim()] });
                    setNewBadge('');
                  }
                }}
                className="px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold inline-flex items-center gap-1 min-h-[40px]"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.trustBadges.map((b, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      trustBadges: draft.trustBadges.filter((_, i) => i !== idx),
                    })
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs inline-flex items-center gap-1.5"
                >
                  {b}
                  <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AVALIAÇÕES DA PÁGINA PÚBLICA */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                Avaliações da Página Pública
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Escolha se o bloco “Avaliações reais” aparece na página pública e personalize a nota, os atendimentos e os 3 depoimentos.
              </p>
            </div>

            <label className="inline-flex items-center gap-3 cursor-pointer select-none shrink-0">
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                {draft.showReviews !== false ? 'Exibindo na página' : 'Oculto na página'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={draft.showReviews !== false}
                aria-label="Exibir ou ocultar o bloco Avaliações reais na página pública"
                onClick={() =>
                  setDraft({ ...draft, showReviews: draft.showReviews === false })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  draft.showReviews !== false
                    ? 'bg-emerald-600'
                    : 'bg-stone-300 dark:bg-stone-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    draft.showReviews !== false ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          <div
            className={`space-y-5 transition-opacity ${
              draft.showReviews === false ? 'opacity-60' : ''
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Nota média (0,0 a 5,0)
                </label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={draft.rating}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      rating: Math.min(5, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Quantidade de atendimentos
                </label>
                <input
                  type="number"
                  min={0}
                  max={10000000}
                  step={1}
                  value={draft.totalAttendances}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      totalAttendances: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                Os 3 depoimentos exibidos na página pública
              </label>
              <div className="grid grid-cols-1 gap-4">
                {buildEditableReviews(draft.reviews).map((rev, idx) => {
                  const updateReviewField = <K extends keyof ReviewItem>(
                    field: K,
                    value: ReviewItem[K]
                  ) => {
                    const next = buildEditableReviews(draft.reviews).map((item, i) =>
                      i === idx ? { ...item, [field]: value } : item
                    );
                    setDraft({ ...draft, reviews: next });
                  };
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                          Depoimento {idx + 1}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-stone-500">
                          <span>Estrelas:</span>
                          <select
                            value={rev.rating}
                            onChange={(e) =>
                              updateReviewField('rating', Number(e.target.value) || 5)
                            }
                            aria-label={`Nota do depoimento ${idx + 1}`}
                            className="px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono-nums"
                          >
                            {[5, 4, 3, 2, 1].map((n) => (
                              <option key={n} value={n}>
                                {n} ★
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">
                            Nome do cliente
                          </label>
                          <input
                            type="text"
                            maxLength={80}
                            value={rev.author}
                            onChange={(e) => updateReviewField('author', e.target.value)}
                            placeholder="Ex: Camila Ferreira"
                            className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">
                            Detalhe (serviço / perfil)
                          </label>
                          <input
                            type="text"
                            maxLength={80}
                            value={rev.role}
                            onChange={(e) => updateReviewField('role', e.target.value)}
                            placeholder="Ex: Paciente · Clareamento"
                            className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">
                            Quando (opcional)
                          </label>
                          <input
                            type="text"
                            maxLength={40}
                            value={rev.date}
                            onChange={(e) => updateReviewField('date', e.target.value)}
                            placeholder="Ex: Há 2 semanas"
                            className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-500 mb-1">
                          Texto do depoimento
                        </label>
                        <textarea
                          rows={2}
                          maxLength={320}
                          value={rev.comment}
                          onChange={(e) => updateReviewField('comment', e.target.value)}
                          placeholder="Escreva o relato real do cliente..."
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs leading-relaxed"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Dica: se deixar um depoimento em branco, ele não aparece na página pública. Clique em{' '}
                <strong>Salvar configurações</strong> no topo para aplicar.
              </p>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* SECTION 2: HORÁRIOS, FERIADOS E REGRAS */}
      {section === 'horarios' && (
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-6">
          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Funcionamento semanal
            </h3>
            {['1', '2', '3', '4', '5', '6', '0'].map((dayKey) => {
              const day = draft.businessHours[dayKey] || { enabled: false, open: '09:00', close: '18:00' };
              return (
                <div
                  key={dayKey}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 text-xs"
                >
                  <label className="flex items-center gap-2 w-32 font-medium text-stone-800 dark:text-stone-200">
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          businessHours: {
                            ...draft.businessHours,
                            [dayKey]: { ...day, enabled: e.target.checked },
                          },
                        })
                      }
                    />
                    {getDayLabelFull(Number(dayKey))}
                  </label>
                  {day.enabled ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={day.open}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            businessHours: {
                              ...draft.businessHours,
                              [dayKey]: { ...day, open: e.target.value },
                            },
                          })
                        }
                        className="px-2 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono-nums"
                      />
                      <span>até</span>
                      <input
                        type="time"
                        value={day.close}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            businessHours: {
                              ...draft.businessHours,
                              [dayKey]: { ...day, close: e.target.value },
                            },
                          })
                        }
                        className="px-2 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono-nums"
                      />
                      <span className="text-stone-400 ml-1">Intervalo:</span>
                      <input
                        type="time"
                        value={day.breakStart || ''}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            businessHours: {
                              ...draft.businessHours,
                              [dayKey]: { ...day, breakStart: e.target.value },
                            },
                          })
                        }
                        className="px-2 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono-nums"
                      />
                      <span>–</span>
                      <input
                        type="time"
                        value={day.breakEnd || ''}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            businessHours: {
                              ...draft.businessHours,
                              [dayKey]: { ...day, breakEnd: e.target.value },
                            },
                          })
                        }
                        className="px-2 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono-nums"
                      />
                    </div>
                  ) : (
                    <span className="text-stone-400">Fechado</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-100 dark:border-stone-800">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Antecedência mínima para agendar (minutos)
              </label>
              <input
                type="number"
                min={0}
                max={10080}
                step={15}
                value={draft.minAdvanceMinutes}
                onChange={(e) => setDraft({ ...draft, minAdvanceMinutes: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Grade de horários (minutos)
              </label>
              <select
                value={draft.slotIntervalMinutes}
                onChange={(e) => setDraft({ ...draft, slotIntervalMinutes: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
              >
                <option value={15}>A cada 15 min</option>
                <option value={30}>A cada 30 min</option>
                <option value={45}>A cada 45 min</option>
                <option value={60}>A cada 60 min</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-stone-500">Feriados (loja fechada)</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newHoliday}
                  onChange={(e) => setNewHoliday(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs font-mono-nums"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newHoliday && !draft.holidays.includes(newHoliday)) {
                      setDraft({ ...draft, holidays: [...draft.holidays, newHoliday].sort() });
                      setNewHoliday('');
                    }
                  }}
                  className="px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold"
                >
                  Adicionar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {draft.holidays.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, holidays: draft.holidays.filter((x) => x !== d) })
                    }
                    className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-mono-nums inline-flex items-center gap-1"
                  >
                    {formatDateBR(d, 'short')} <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-stone-500">Bloqueios pontuais</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newBlocked}
                  onChange={(e) => setNewBlocked(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs font-mono-nums"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newBlocked && !draft.blockedDates.includes(newBlocked)) {
                      setDraft({
                        ...draft,
                        blockedDates: [...draft.blockedDates, newBlocked].sort(),
                      });
                      setNewBlocked('');
                    }
                  }}
                  className="px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold"
                >
                  Bloquear
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {draft.blockedDates.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, blockedDates: draft.blockedDates.filter((x) => x !== d) })
                    }
                    className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-mono-nums inline-flex items-center gap-1"
                  >
                    {formatDateBR(d, 'short')} <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Instruções de chegada
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={draft.arrivalInstructions}
                onChange={(e) => setDraft({ ...draft, arrivalInstructions: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Política de cancelamento
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={draft.cancellationPolicy}
                onChange={(e) => setDraft({ ...draft, cancellationPolicy: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: PIX COPIA E COLA (BR CODE CRC16) */}
      {section === 'pix' && (
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-5">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Sinal via Pix Copia e Cola (BR Code com CRC16)
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Preencha os dados abaixo para gerar automaticamente o código Pix com o valor exato nos
              serviços que exigem sinal. Sem taxa de gateway — o Pix cai direto na sua conta.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Chave Pix (CPF, CNPJ, E-mail, Telefone ou Aleatória)
              </label>
              <input
                type="text"
                maxLength={100}
                value={draft.pixKey}
                onChange={(e) => setDraft({ ...draft, pixKey: e.target.value })}
                placeholder="ex: contato@suaempresa.com.br"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Nome do recebedor (sem acentos, até 25 letras)
              </label>
              <input
                type="text"
                maxLength={60}
                value={draft.pixMerchantName}
                onChange={(e) => setDraft({ ...draft, pixMerchantName: e.target.value })}
                placeholder="CLINICA SORRISO"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">
                Cidade do recebedor
              </label>
              <input
                type="text"
                maxLength={40}
                value={draft.pixMerchantCity}
                onChange={(e) => setDraft({ ...draft, pixMerchantCity: e.target.value })}
                placeholder="SAO PAULO"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm uppercase"
              />
            </div>
          </div>

          {pixPreview && (
            <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  Prévia BR Code validado (exemplo R$ 50,00)
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(pixPreview);
                    setCopiedTestPix(true);
                    setTimeout(() => setCopiedTestPix(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-stone-900 dark:text-stone-100 hover:underline"
                >
                  {copiedTestPix ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedTestPix ? 'Copiado!' : 'Testar cópia'}
                </button>
              </div>
              <p className="font-mono text-[11px] break-all text-stone-600 dark:text-stone-300">
                {pixPreview}
              </p>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: LEMBRETE DIÁRIO, MENSAGENS EDITÁVEIS E WEBHOOK DE AUTOMAÇÃO */}
      {section === 'mensagens' && (
        <div className="space-y-6">
          {/* Lembrete diário do dono (calendário .ics com VALARM) */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Lembrete diário do dono (no seu calendário)
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                Opção recomendada: crie um único alarme diário no calendário do seu celular (Apple,
                Google ou Outlook) para abrir a fila de lembretes e avisar os clientes do dia
                seguinte, sem precisar criar um evento separado para cada agendamento.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="sm:w-56">
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Horário padrão (dia anterior)
                </label>
                <input
                  type="time"
                  value={draft.dailyReminderTime || '18:00'}
                  onChange={(e) => setDraft({ ...draft, dailyReminderTime: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  downloadDailyOwnerReminderIcs({
                    storeId: store.storeId,
                    storeName: draft.name || store.name,
                    timeHHMM: draft.dailyReminderTime || '18:00',
                  })
                }
                className="px-4 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-[46px] hover:opacity-90"
              >
                <CalendarPlus className="w-4 h-4" />
                Criar lembrete diário no meu calendário
              </button>
            </div>

            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              O arquivo <span className="font-mono">.ics</span> inclui o alarme embutido (“Hora de
              avisar seus clientes”) e o link direto para a fila de lembretes do painel.
            </p>
          </div>

          {/* Mensagens editáveis do WhatsApp */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-5">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                Mensagens prontas do WhatsApp
              </h3>
              <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                Variáveis disponíveis:{' '}
                <span className="font-mono text-stone-900 dark:text-stone-100">
                  [nome] [serviço] [profissional] [dia da semana] [data] [hora] [loja] [link]{' '}
                  [googleReview]
                </span>
              </div>
            </div>

            {(
              [
                ['reminder24h', 'Lembrete 24 horas antes (com pedido 1 para confirmar / 2 para remarcar)'],
                ['reminder2h', 'Lembrete 2 horas antes'],
                ['postVisitReview', 'Pedido de avaliação no Google (pós-atendimento)'],
                ['confirmation', 'Confirmação enviada pelo cliente ao agendar'],
                ['reschedule', 'Aviso de remarcação'],
                ['cancel', 'Aviso de cancelamento'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
                  {label}
                </label>
                <textarea
                  rows={3}
                  value={draft.messageTemplates[key]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      messageTemplates: {
                        ...draft.messageTemplates,
                        [key]: e.target.value,
                      },
                    })
                  }
                  className="w-full p-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs leading-relaxed"
                />
              </div>
            ))}
          </div>

          {/* Gancho para automação (Webhook opcional) */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Webhook className="w-4 h-4" />
                Gancho para automação (Webhook opcional)
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                Se preenchido, o sistema envia uma requisição <span className="font-mono">POST</span>{' '}
                em JSON a cada novo agendamento, cancelamento ou remarcação (ideal para conectar ao
                n8n, Make ou Zapier). Se ficar vazio, nada é enviado.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="url"
                maxLength={300}
                value={draft.automationWebhookUrl || ''}
                onChange={(e) => {
                  setDraft({ ...draft, automationWebhookUrl: e.target.value });
                  setWebhookStatus(null);
                }}
                placeholder="https://seu-n8n.exemplo.com/webhook/agendamentos"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono"
              />
              {draft.automationWebhookUrl?.trim() && (
                <button
                  type="button"
                  onClick={async () => {
                    const url = draft.automationWebhookUrl?.trim() || '';
                    if (!/^https?:\/\//i.test(url)) {
                      setWebhookStatus('Informe uma URL iniciando com https:// ou http://');
                      return;
                    }
                    setWebhookStatus('Enviando teste...');
                    try {
                      await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          evento: 'novo_agendamento',
                          teste: true,
                          storeId: store.storeId,
                          loja: draft.name || store.name,
                          cliente: 'Cliente Exemplo',
                          whatsapp: '5511999998888',
                          servico: 'Serviço Exemplo',
                          profissional: 'Profissional Exemplo',
                          data: new Date().toISOString().slice(0, 10),
                          hora: '14:00',
                          status: 'agendado',
                          timestamp: new Date().toISOString(),
                        }),
                      });
                      setWebhookStatus('Teste disparado com sucesso! Confira no seu fluxo (n8n/Make).');
                    } catch {
                      setWebhookStatus(
                        'Envio disparado (o servidor de destino pode bloquear leitura CORS no navegador — verifique nos logs do webhook).'
                      );
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[44px] whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  Testar envio
                </button>
              )}
            </div>

            {webhookStatus && (
              <p className="text-xs text-stone-600 dark:text-stone-300">{webhookStatus}</p>
            )}

            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/70 dark:border-stone-800 text-[11px] font-mono text-stone-600 dark:text-stone-400 overflow-x-auto">
              {'{ "evento": "novo_agendamento | cancelamento | remarcacao", "loja": "...", "cliente": "...", "whatsapp": "...", "servico": "...", "profissional": "...", "data": "YYYY-MM-DD", "hora": "HH:mm", "status": "..." }'}
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
