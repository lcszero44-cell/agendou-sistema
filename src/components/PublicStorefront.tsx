import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  ChevronDown,
  Clock,
  Lock,
  MapPin,
  MessageCircle,
  Moon,
  Navigation,
  ShieldCheck,
  Star,
  Sun,
} from 'lucide-react';
import { DEMO_STORES_LIST, SEGMENT_TEMPLATES } from '../config/segmentTemplates';
import { findNextAvailableSlot } from '../lib/availability';
import {
  buildWhatsappUrl,
  formatCurrencyBRL,
  formatDateBR,
  getDayLabelFull,
  isStoreOpenNow,
} from '../lib/brUtils';
import {
  SegmentKey,
  ServiceItem,
  SlotLockRecord,
  StaffMember,
  StoreConfig,
} from '../types/booking';
import { LgpdPrivacyModal } from './LgpdPrivacyModal';
import { SafeImage } from './SafeImage';

interface PublicStorefrontProps {
  store: StoreConfig;
  services: ServiceItem[];
  staff: StaffMember[];
  slotLocks: SlotLockRecord[];
  isDemoMode: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenBooking: (serviceId?: string | null, staffId?: string | null) => void;
  onSelectStoreId: (storeId: string) => void;
  onSelectSegmentPreview: (segment: SegmentKey) => void;
  onOpenAdmin: () => void;
}

export const PublicStorefront: React.FC<PublicStorefrontProps> = ({
  store,
  services,
  staff,
  slotLocks,
  isDemoMode,
  darkMode,
  onToggleDarkMode,
  onOpenBooking,
  onSelectStoreId,
  onSelectSegmentPreview,
  onOpenAdmin,
}) => {
  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(activeServices.map((s) => s.category || 'Serviços')));
    return ['Todos', ...cats];
  }, [activeServices]);

  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [showPrivacy, setShowPrivacy] = useState(false);

  React.useEffect(() => {
    setSelectedCategory('Todos');
  }, [store.storeId, store.segment]);

  const filteredServices = useMemo(() => {
    if (selectedCategory === 'Todos') return activeServices;
    return activeServices.filter((s) => (s.category || 'Serviços') === selectedCategory);
  }, [activeServices, selectedCategory]);

  const openStatus = useMemo(() => isStoreOpenNow(store), [store]);

  const nextSlotPreview = useMemo(() => {
    if (activeServices.length === 0) return null;
    return findNextAvailableSlot({
      store,
      service: activeServices[0],
      staffList: activeStaff,
      selectedStaffId: 'any',
      activeLocks: slotLocks,
      daysAhead: 7,
    });
  }, [store, activeServices, activeStaff, slotLocks]);

  const whatsappDirectUrl = buildWhatsappUrl(
    store.whatsapp,
    `Olá, ${store.name}! Vim pela página de agendamento e gostaria de tirar uma dúvida.`
  );

  const mapsDirectionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    store.mapsQuery || store.address
  )}`;

  return (
    <div
      className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 pb-20 md:pb-0"
      style={
        {
          '--brand-primary': store.primaryColor,
          '--brand-accent': store.accentColor,
        } as React.CSSProperties
      }
    >
      {/* Top Bar Contract: Strict 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-stone-50/90 dark:bg-stone-950/90 backdrop-blur-md border-b border-stone-200/80 dark:border-stone-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#inicio"
            className="font-display text-lg sm:text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100 whitespace-nowrap shrink-0"
          >
            {store.name}
          </a>

          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600 dark:text-stone-400"
          >
            <a
              href="#servicos"
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0"
            >
              Serviços
            </a>
            <a
              href="#equipe"
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0"
            >
              Equipe
            </a>
            <a
              href="#duvidas"
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0"
            >
              Dúvidas
            </a>
            <a
              href="#localizacao"
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0"
            >
              Localização
            </a>
          </nav>

          <button
            type="button"
            onClick={() => onOpenBooking(null, null)}
            className="px-4 sm:px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 min-h-[40px]"
            style={{ backgroundColor: store.primaryColor }}
          >
            Agendar agora
          </button>
        </div>
      </header>

      <main id="inicio">
        {/* HERO SECTION: Asymmetric 2-column split with items-stretch */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-10 sm:pt-12 sm:pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="text-xs font-medium text-stone-600 dark:text-stone-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={openStatus.open ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : ''}>
                  {openStatus.label}
                </span>
                <span aria-hidden="true">·</span>
                <span>{store.tagline}</span>
              </div>

              <h1
                className="font-display font-semibold tracking-tight text-stone-900 dark:text-stone-50 leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4.2vw, 3.6rem)' }}
              >
                {store.heroTitle}
              </h1>

              <p className="text-base sm:text-lg text-stone-600 dark:text-stone-300 leading-relaxed max-w-xl">
                {store.heroSubtitle}
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenBooking(null, null)}
                  className="px-7 py-4 rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2.5 hover:opacity-95 active:scale-[0.98] transition-all min-h-[52px] whitespace-nowrap"
                  style={{ backgroundColor: store.primaryColor }}
                >
                  <CalendarCheck className="w-5 h-5" />
                  Agendar agora
                </button>

                <a
                  href={whatsappDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-4 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[52px] whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Falar no WhatsApp
                </a>
              </div>

              {nextSlotPreview && (
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Próximo horário livre:{' '}
                  <button
                    type="button"
                    onClick={() => onOpenBooking(activeServices[0]?.id, null)}
                    className="font-semibold text-stone-800 dark:text-stone-200 underline underline-offset-4 hover:opacity-80"
                  >
                    {formatDateBR(nextSlotPreview.date, 'weekday')} às {nextSlotPreview.slot.label}
                  </button>
                </p>
              )}
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-64 sm:h-80 lg:h-full min-h-[300px] rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-800">
                <SafeImage
                  src={store.heroImage}
                  alt={`Espaço de atendimento ${store.name}`}
                  fallbackLabel={store.name}
                  className="w-full h-full object-cover"
                />
                {store.showReviews !== false && (
                  <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex items-end p-5">
                    <div className="text-white text-xs sm:text-sm flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="inline-flex items-center gap-1 font-semibold font-mono-nums">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {store.rating.toFixed(1)}
                      </span>
                      <span className="opacity-70" aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        +{store.totalAttendances.toLocaleString('pt-BR')} atendimentos realizados
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full-width Proof & Trust Strip below hero split */}
          <div className="mt-8 pt-6 border-t border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs sm:text-sm text-stone-600 dark:text-stone-400">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {store.trustBadges.map((badge, idx) => (
                <React.Fragment key={badge}>
                  {idx > 0 && <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>}
                  <span className="font-medium text-stone-800 dark:text-stone-200">{badge}</span>
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap shrink-0">
              <ShieldCheck className="w-4 h-4 text-stone-400" />
              <span>Confirmação rápida pelo WhatsApp · Lembretes enviados pela clínica</span>
            </div>
          </div>
        </section>

        {/* INTERACTIVE DEMO & SEGMENT SHOWCASE BAR (only visible with ?demo=1) */}
        {isDemoMode && (
        <section
          aria-label="Demonstração de lojas e modelos por segmento"
          className="border-y border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/70"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 mr-1">
                Lojas demo:
              </span>
              {DEMO_STORES_LIST.map((demo) => {
                const isActive = store.storeId === demo.storeId;
                return (
                  <button
                    key={demo.storeId}
                    type="button"
                    onClick={() => onSelectStoreId(demo.storeId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-h-[36px] ${
                      isActive
                        ? 'text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                    style={isActive ? { backgroundColor: store.primaryColor } : undefined}
                  >
                    {demo.label}
                  </button>
                );
              })}

              <span className="text-stone-300 dark:text-stone-700 mx-1 hidden sm:inline" aria-hidden="true">
                |
              </span>

              <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 mr-1">
                Modelos:
              </span>
              {(Object.keys(SEGMENT_TEMPLATES) as SegmentKey[]).map((segKey) => {
                const tpl = SEGMENT_TEMPLATES[segKey];
                const isActive = store.segment === segKey;
                return (
                  <button
                    key={segKey}
                    type="button"
                    onClick={() => onSelectSegmentPreview(segKey)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap min-h-[36px] ${
                      isActive
                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    {tpl.shortLabel}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onToggleDarkMode}
                aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-1.5 min-h-[36px] whitespace-nowrap"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                {darkMode ? 'Claro' : 'Escuro'}
              </button>

              <button
                type="button"
                onClick={onOpenAdmin}
                className="px-3.5 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-xs font-semibold text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-1.5 min-h-[36px] whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                Painel Admin
              </button>
            </div>
          </div>
        </section>
        )}

        {/* SERVICES SECTION */}
        <section id="servicos" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-50">
                Serviços e valores
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Preços transparentes e duração real de cada atendimento. Escolha e agende direto.
              </p>
            </div>

            {categories.length > 2 && (
              <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-x-auto no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                      selectedCategory === cat
                        ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredServices.map((srv) => (
              <div
                key={srv.id}
                className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex flex-col justify-between gap-5 hover:border-stone-300 dark:hover:border-stone-700 transition-colors"
              >
                <div className="space-y-2">
                  <div className="text-xs text-stone-500 dark:text-stone-400">
                    {srv.category} · {srv.durationMinutes} min
                    {srv.requiresDeposit && srv.depositAmountCents > 0
                      ? ` · Sinal Pix ${formatCurrencyBRL(srv.depositAmountCents)}`
                      : ''}
                  </div>
                  <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                    {srv.name}
                  </h3>
                  {srv.description && (
                    <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                      {srv.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4 pt-3 border-t border-stone-100 dark:border-stone-800">
                  <span className="font-mono-nums text-lg font-semibold text-stone-900 dark:text-stone-100">
                    {formatCurrencyBRL(srv.priceCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenBooking(srv.id, null)}
                    className="px-4 py-2.5 rounded-xl text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-all min-h-[44px] whitespace-nowrap"
                    style={{ backgroundColor: store.primaryColor }}
                  >
                    Agendar
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TEAM SECTION */}
        <section
          id="equipe"
          className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/40"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16 space-y-8">
            <div className="space-y-1.5 max-w-xl">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-50">
                Quem vai atender você
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Profissionais dedicados com agenda própria. Escolha seu especialista preferido ou o
                primeiro horário disponível.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeStaff.map((member) => (
                <div
                  key={member.id}
                  className="p-5 rounded-2xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex flex-col justify-between gap-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <SafeImage
                        src={member.avatarUrl}
                        alt={member.name}
                        fallbackLabel={member.name}
                        className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-stone-200 dark:border-stone-700"
                      />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {member.name}
                        </h3>
                        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                          {member.role}
                        </p>
                      </div>
                    </div>
                    {member.specialty && (
                      <p className="text-xs font-medium text-stone-700 dark:text-stone-300">
                        Especialidade: {member.specialty}
                      </p>
                    )}
                    {member.bio && (
                      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                        {member.bio}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenBooking(null, member.id)}
                    className="w-full py-2.5 px-4 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-xs font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[44px]"
                  >
                    Agendar com {member.name.split(' ')[0]}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* REVIEWS & FAQ SECTION */}
        <section id="duvidas" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Client Reviews */}
            {store.showReviews !== false && (
              <div className="lg:col-span-5 space-y-5">
                <div className="space-y-1">
                  <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-50">
                    Avaliações reais
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <strong className="font-mono-nums text-stone-900 dark:text-stone-100">
                      {store.rating.toFixed(1)} de 5
                    </strong>
                    <span>·</span>
                    <span className="tabular-nums">
                      {store.totalAttendances.toLocaleString('pt-BR')} atendimentos
                    </span>
                  </p>
                </div>

                <div className="space-y-4">
                  {store.reviews
                    .filter((rev) => rev.author.trim() || rev.comment.trim())
                    .map((rev, idx) => (
                      <article
                        key={idx}
                        className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3"
                      >
                        <div className="flex items-center gap-0.5" aria-label={`${rev.rating} estrelas`}>
                          {Array.from({ length: Math.min(5, Math.max(1, rev.rating || 5)) }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                        {rev.comment.trim() && (
                          <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                            “{rev.comment}”
                          </p>
                        )}
                        <div className="text-xs text-stone-500 dark:text-stone-400">
                          {rev.author.trim() && (
                            <strong className="text-stone-900 dark:text-stone-200">{rev.author}</strong>
                          )}
                          {rev.role.trim() && (
                            <>
                              {rev.author.trim() ? ' · ' : ''}
                              {rev.role}
                            </>
                          )}
                          {rev.date.trim() && (
                            <>
                              {rev.author.trim() || rev.role.trim() ? ' · ' : ''}
                              {rev.date}
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              </div>
            )}

            {/* FAQ Accordion */}
            <div className={store.showReviews !== false ? 'lg:col-span-7 space-y-5' : 'lg:col-span-12 max-w-3xl space-y-5'}>
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-50">
                  Perguntas frequentes
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Respostas diretas para você agendar com tranquilidade.
                </p>
              </div>

              <div className="divide-y divide-stone-200 dark:divide-stone-800 border-y border-stone-200 dark:border-stone-800">
                {store.faq.map((item, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div key={idx}>
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        aria-expanded={isOpen}
                        className="w-full py-4 flex items-center justify-between gap-4 text-left min-h-[52px]"
                      >
                        <span className="font-medium text-sm sm:text-base text-stone-900 dark:text-stone-100">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <p className="pb-4 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                          {item.answer}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* LOCATION & BUSINESS HOURS SECTION */}
        <section
          id="localizacao"
          className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/50"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-6 space-y-5">
              <div className="space-y-1.5">
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-50">
                  Onde estamos
                </h2>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {openStatus.label}
                </p>
              </div>

              <div className="flex items-start gap-3 text-sm text-stone-700 dark:text-stone-300">
                <MapPin className="w-5 h-5 shrink-0 mt-0.5 text-stone-400" />
                <span>{store.address}</span>
              </div>

              {store.arrivalInstructions && (
                <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  {store.arrivalInstructions}
                </p>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  href={mapsDirectionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm font-semibold inline-flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[44px]"
                >
                  <Navigation className="w-4 h-4" />
                  Como chegar
                </a>
                <a
                  href={whatsappDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm font-semibold inline-flex items-center gap-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 min-h-[44px]"
                >
                  <MessageCircle className="w-4 h-4" />
                  Chamar no WhatsApp
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="p-6 rounded-2xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100 pb-2 border-b border-stone-200 dark:border-stone-800">
                  <Clock className="w-4 h-4 text-stone-400" />
                  Horários de funcionamento
                </div>
                <dl className="divide-y divide-stone-200/70 dark:divide-stone-800/70 text-sm">
                  {['1', '2', '3', '4', '5', '6', '0'].map((dayKey) => {
                    const day = store.businessHours[dayKey];
                    const isToday = String(new Date().getDay()) === dayKey;
                    return (
                      <div
                        key={dayKey}
                        className={`py-2.5 flex items-center justify-between gap-4 ${
                          isToday ? 'font-semibold text-stone-900 dark:text-stone-50' : 'text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        <dt>
                          {getDayLabelFull(Number(dayKey))}
                          {isToday ? ' (hoje)' : ''}
                        </dt>
                        <dd className="font-mono-nums text-xs sm:text-sm">
                          {day && day.enabled ? `${day.open} – ${day.close}` : 'Fechado'}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500 dark:text-stone-400">
          <p>
            © {new Date().getFullYear()} {store.name}. Agendamento online rápido e seguro.
          </p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="hover:text-stone-900 dark:hover:text-stone-100 underline-offset-4 hover:underline py-1"
            >
              Privacidade (LGPD)
            </button>
            {isDemoMode && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hover:text-stone-900 dark:hover:text-stone-100 underline-offset-4 hover:underline py-1"
              >
                Acesso do profissional
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Mobile Fixed Sticky Bottom CTA (<= 8% viewport height) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 px-4 py-2.5 flex items-center gap-2.5">
        <a
          href={whatsappDirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="min-w-[48px] h-12 rounded-xl border border-stone-300 dark:border-stone-700 flex items-center justify-center text-emerald-600 dark:text-emerald-400 bg-white dark:bg-stone-900 shrink-0"
        >
          <MessageCircle className="w-5 h-5" />
        </a>
        <button
          type="button"
          onClick={() => onOpenBooking(null, null)}
          className="flex-1 h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          style={{ backgroundColor: store.primaryColor }}
        >
          <CalendarCheck className="w-4 h-4" />
          Agendar agora
        </button>
      </div>

      <LgpdPrivacyModal
        open={showPrivacy}
        storeName={store.name}
        onClose={() => setShowPrivacy(false)}
      />
    </div>
  );
};
