import React, { useEffect, useState } from 'react';
import { signOut, User } from 'firebase/auth';
import {
  Briefcase,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import { SEGMENT_TEMPLATES } from '../config/segmentTemplates';
import { buildStorePublicUrl } from '../lib/brUtils';
import { auth } from '../lib/firebase';
import {
  findAdminStoreIds,
  seedStoreFromTemplate,
  subscribeAdminStore,
} from '../lib/storeRepository';
import {
  AppointmentRecord,
  SegmentKey,
  ServiceItem,
  SlotLockRecord,
  StaffMember,
  StoreConfig,
  WaitlistRecord,
} from '../types/booking';
import { AdminAgendaTab } from './admin/AdminAgendaTab';
import { AdminServicesTab } from './admin/AdminServicesTab';
import { AdminSettingsTab } from './admin/AdminSettingsTab';
import { AdminStaffTab } from './admin/AdminStaffTab';
import { OnboardingWizardModal } from './admin/OnboardingWizardModal';

interface AdminPanelProps {
  user: User;
  darkMode: boolean;
  initialFocusReminders?: boolean;
  onToggleDarkMode: () => void;
  onViewPublicStore: (storeId: string) => void;
}

type AdminTab = 'agenda' | 'servicos' | 'equipe' | 'configuracoes';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  user,
  darkMode,
  initialFocusReminders = false,
  onToggleDarkMode,
  onViewPublicStore,
}) => {
  const [ownedStores, setOwnedStores] = useState<StoreConfig[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [loadingStores, setLoadingStores] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Live store collections
  const [store, setStore] = useState<StoreConfig | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [slotLocks, setSlotLocks] = useState<SlotLockRecord[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistRecord[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('agenda');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // First-time store creation form state
  const [newStoreSegment, setNewStoreSegment] = useState<SegmentKey>('odontologia');
  const [newStoreName, setNewStoreName] = useState('');

  const loadOwnedStores = async () => {
    setLoadingStores(true);
    try {
      const list = await findAdminStoreIds(user.uid);
      setOwnedStores(list);
      if (list.length > 0) {
        setActiveStoreId((prev) =>
          prev && list.some((s) => s.storeId === prev) ? prev : list[0].storeId
        );
      } else {
        setActiveStoreId(null);
      }
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Erro ao carregar lojas.');
    } finally {
      setLoadingStores(false);
    }
  };

  useEffect(() => {
    loadOwnedStores();
  }, [user.uid]);

  useEffect(() => {
    if (!activeStoreId) return;
    setRuntimeError(null);
    const unsub = subscribeAdminStore({
      storeId: activeStoreId,
      ownerUid: user.uid,
      onStore: setStore,
      onServices: setServices,
      onStaff: setStaff,
      onAppointments: setAppointments,
      onSlotLocks: setSlotLocks,
      onWaitlist: setWaitlist,
      onError: (err) => setRuntimeError(err.message),
    });
    return () => unsub();
  }, [activeStoreId, user.uid]);

  const handleSeedDemo = async (segment: SegmentKey, customId?: string, customName?: string) => {
    setSeeding(true);
    setRuntimeError(null);
    try {
      const created = await seedStoreFromTemplate({
        segment,
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        customStoreId: customId,
        customName,
        includeDemoAppointments: true,
      });
      await loadOwnedStores();
      setActiveStoreId(created.storeId);
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Erro ao criar loja.');
    } finally {
      setSeeding(false);
    }
  };

  const handleCopyPublicLink = async () => {
    if (!store) return;
    await navigator.clipboard.writeText(buildStorePublicUrl(store.storeId));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loadingStores) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-6">
        <p className="text-sm text-stone-500">Carregando seu painel administrativo...</p>
      </div>
    );
  }

  // First-time onboarding when user has no Firestore store yet
  if (!activeStoreId) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-stone-500">Bem-vindo(a), {user.email}</p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-50 mt-1">
                Ative sua primeira loja
              </h1>
              <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
                Crie sua loja personalizada ou publique as lojas de demonstração no banco de dados
                Firestore em 1 clique.
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 underline shrink-0"
            >
              Sair
            </button>
          </div>

          {runtimeError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
              {runtimeError}
            </div>
          )}

          <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 space-y-3">
            <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
              Publicar lojas de demonstração (com serviços, equipe e agenda de exemplo)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={seeding}
                onClick={() => handleSeedDemo('odontologia', 'clinica-sorriso', 'Clínica Sorriso')}
                className="py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold min-h-[48px] disabled:opacity-50"
              >
                {seeding ? 'Publicando...' : 'Publicar Clínica Sorriso'}
              </button>
              <button
                type="button"
                disabled={seeding}
                onClick={() =>
                  handleSeedDemo('barbearia', 'barbearia-navalha', 'Barbearia Navalha')
                }
                className="py-3 px-4 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold min-h-[48px] disabled:opacity-50"
              >
                {seeding ? 'Publicando...' : 'Publicar Barbearia Navalha'}
              </button>
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-stone-100 dark:border-stone-800">
            <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              Ou crie uma loja nova do seu segmento
            </p>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Nome do negócio</label>
              <input
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="Ex: Studio Bela Vida"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(SEGMENT_TEMPLATES) as SegmentKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNewStoreSegment(key)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-semibold ${
                    newStoreSegment === key
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-transparent'
                      : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {SEGMENT_TEMPLATES[key].shortLabel}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={seeding}
              onClick={() => {
                const name =
                  newStoreName.trim() || SEGMENT_TEMPLATES[newStoreSegment].store.name;
                const slug =
                  name
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '') || `loja-${Date.now()}`;
                handleSeedDemo(newStoreSegment, slug, name);
              }}
              className="w-full py-3.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-semibold min-h-[48px] disabled:opacity-50"
            >
              {seeding ? 'Criando loja no Firestore...' : 'Criar minha loja agora'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'agenda', label: 'Agenda', icon: <Calendar className="w-4 h-4" /> },
    { id: 'servicos', label: 'Serviços', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'equipe', label: 'Equipe', icon: <Users className="w-4 h-4" /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings className="w-4 h-4" /> },
  ];

  const hasSorriso = ownedStores.some((s) => s.storeId === 'clinica-sorriso');
  const hasNavalha = ownedStores.some((s) => s.storeId === 'barbearia-navalha');

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex pb-20 lg:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 justify-between sticky top-0 h-screen">
        <div className="space-y-6">
          <div className="px-2 pt-1 space-y-2">
            <span className="font-display text-lg font-semibold text-stone-900 dark:text-stone-50 block truncate">
              {store?.name || 'Painel Admin'}
            </span>
            {ownedStores.length > 1 && (
              <select
                value={activeStoreId}
                onChange={(e) => setActiveStoreId(e.target.value)}
                aria-label="Selecionar loja"
                className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-medium"
              >
                {ownedStores.map((s) => (
                  <option key={s.storeId} value={s.storeId}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                    active
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Quick Demo Seeder for Owner Presentations */}
          {(!hasSorriso || !hasNavalha) && (
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800 space-y-2">
              <p className="text-[11px] font-medium text-stone-500">Adicionar demo no Firestore:</p>
              {!hasSorriso && (
                <button
                  type="button"
                  disabled={seeding}
                  onClick={() => handleSeedDemo('odontologia', 'clinica-sorriso', 'Clínica Sorriso')}
                  className="w-full py-2 px-2.5 rounded-lg border border-stone-300 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-white dark:hover:bg-stone-800"
                >
                  <Plus className="w-3.5 h-3.5" /> Clínica Sorriso
                </button>
              )}
              {!hasNavalha && (
                <button
                  type="button"
                  disabled={seeding}
                  onClick={() =>
                    handleSeedDemo('barbearia', 'barbearia-navalha', 'Barbearia Navalha')
                  }
                  className="w-full py-2 px-2.5 rounded-lg border border-stone-300 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-white dark:hover:bg-stone-800"
                >
                  <Plus className="w-3.5 h-3.5" /> Barbearia Navalha
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 pt-4 border-t border-stone-100 dark:border-stone-800">
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[40px]"
          >
            <Sparkles className="w-4 h-4" />
            Assistente 5 passos
          </button>
          <div className="flex items-center justify-between px-2 py-1 text-xs text-stone-500">
            <span className="truncate">{user.email}</span>
            <button
              type="button"
              onClick={() => signOut(auth)}
              aria-label="Sair da conta"
              className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display font-semibold text-base sm:text-lg truncate lg:hidden">
              {store?.name || 'Admin'}
            </span>
            <span className="hidden lg:inline text-sm text-stone-500 dark:text-stone-400">
              Painel /{' '}
              <strong className="text-stone-900 dark:text-stone-100 capitalize">{activeTab}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {store && (
              <>
                <button
                  type="button"
                  onClick={handleCopyPublicLink}
                  className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[38px] whitespace-nowrap"
                >
                  {copiedLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {copiedLink ? 'Link copiado!' : 'Copiar link público'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewPublicStore(store.storeId)}
                  className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[38px] whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ver página</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label="Alternar tema"
              className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[38px] min-w-[38px] flex items-center justify-center"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => signOut(auth)}
              aria-label="Sair"
              className="lg:hidden p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[38px] min-w-[38px] flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {runtimeError && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
              {runtimeError}
            </div>
          )}

          {!store ? (
            <div className="py-16 text-center text-sm text-stone-500">
              Carregando dados da loja...
            </div>
          ) : (
            <>
              {activeTab === 'agenda' && (
                <AdminAgendaTab
                  store={store}
                  services={services}
                  staff={staff}
                  appointments={appointments}
                  slotLocks={slotLocks}
                  waitlist={waitlist}
                  initialFocusReminders={initialFocusReminders}
                />
              )}
              {activeTab === 'servicos' && (
                <AdminServicesTab store={store} services={services} />
              )}
              {activeTab === 'equipe' && (
                <AdminStaffTab store={store} services={services} staff={staff} />
              )}
              {activeTab === 'configuracoes' && <AdminSettingsTab store={store} />}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Navegação do painel"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 grid grid-cols-4"
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] font-semibold ${
                active
                  ? 'text-stone-900 dark:text-stone-50'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {store && (
        <OnboardingWizardModal
          open={wizardOpen}
          store={store}
          services={services}
          staff={staff}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
};
