import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { AdminAuthScreen } from './components/AdminAuthScreen';
import { AdminPanel } from './components/AdminPanel';
import { BookingFlowModal } from './components/BookingFlowModal';
import { ClientManageBooking } from './components/ClientManageBooking';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicStorefront } from './components/PublicStorefront';
import { isAuthorizedAdminEmail } from './config/accessControl';
import { SEGMENT_TEMPLATES } from './config/segmentTemplates';
import { auth } from './lib/firebase';
import { loadPublicStoreBundle, PublicStoreBundle } from './lib/storeRepository';
import { SegmentKey } from './types/booking';

interface RouteState {
  isAdmin: boolean;
  isDemoMode: boolean;
  adminFocusReminders: boolean;
  storeId: string;
  segmentPreview: SegmentKey | null;
  manageToken: string | null;
}

function readRouteFromUrl(): RouteState {
  const params = new URLSearchParams(window.location.search);
  const isAdmin = params.get('painel') === 'admin';
  const isDemoMode = params.get('demo') === '1';
  const adminFocusReminders = params.get('aba') === 'lembretes';
  const rawSegment = params.get('modelo') as SegmentKey | null;
  const segmentPreview = rawSegment && SEGMENT_TEMPLATES[rawSegment] ? rawSegment : null;
  const storeId =
    params.get('loja') ||
    (segmentPreview ? SEGMENT_TEMPLATES[segmentPreview].store.storeId : 'clinica-sorriso');
  const manageToken = params.get('reserva');
  return { isAdmin, isDemoMode, adminFocusReminders, storeId, segmentPreview, manageToken };
}

function pushQueryUrl(next: Partial<RouteState>) {
  const params = new URLSearchParams();
  if (next.isAdmin) {
    params.set('painel', 'admin');
    if (next.adminFocusReminders) {
      params.set('aba', 'lembretes');
    }
  } else {
    if (next.segmentPreview) {
      params.set('modelo', next.segmentPreview);
    } else if (next.storeId) {
      params.set('loja', next.storeId);
    }
    if (next.manageToken) {
      params.set('reserva', next.manageToken);
    }
    if (next.isDemoMode) {
      params.set('demo', '1');
    }
  }
  const search = params.toString();
  const newUrl = `${window.location.pathname}${search ? `?${search}` : ''}`;
  window.history.pushState({}, '', newUrl);
}

function AppContent() {
  const [route, setRoute] = useState<RouteState>(() => readRouteFromUrl());
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('agendou_theme');
      if (saved) return saved === 'dark';
    } catch {
      // ignore
    }
    return false;
  });

  // Auth state (for ?painel=admin)
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReloadTick, setAuthReloadTick] = useState(0);

  // Public store state
  const [bundle, setBundle] = useState<PublicStoreBundle | null>(null);
  const [loadingStore, setLoadingStore] = useState(true);

  // Booking modal state
  const [bookingModal, setBookingModal] = useState<{
    open: boolean;
    serviceId?: string | null;
    staffId?: string | null;
  }>({ open: false });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('agendou_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, [authReloadTick]);

  useEffect(() => {
    const onPop = () => setRoute(readRouteFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refreshPublicStore = useCallback(async () => {
    setLoadingStore(true);
    try {
      const data = await loadPublicStoreBundle(route.storeId, route.segmentPreview);
      setBundle(data);
      document.title = `${data.store.name} — Agendamento Online`;
    } finally {
      setLoadingStore(false);
    }
  }, [route.storeId, route.segmentPreview]);

  useEffect(() => {
    if (!route.isAdmin) {
      refreshPublicStore();
    }
  }, [route.isAdmin, refreshPublicStore]);

  const navigate = (next: RouteState) => {
    pushQueryUrl(next);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. ADMIN PANEL ROUTE (?painel=admin)
  if (route.isAdmin) {
    if (!authReady) {
      return (
        <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-6">
          <p className="text-sm text-stone-500">Verificando sessão...</p>
        </div>
      );
    }

    if (!authUser || !authUser.emailVerified) {
      return (
        <AdminAuthScreen
          unverifiedUser={authUser && !authUser.emailVerified ? authUser : null}
          onBackToPublic={() =>
            navigate({
              isAdmin: false,
              isDemoMode: route.isDemoMode,
              adminFocusReminders: false,
              storeId: route.storeId || 'clinica-sorriso',
              segmentPreview: null,
              manageToken: null,
            })
          }
          onUserReloaded={() => setAuthReloadTick((n) => n + 1)}
        />
      );
    }

    if (!isAuthorizedAdminEmail(authUser.email)) {
      return (
        <AdminAuthScreen
          unauthorizedEmail={authUser.email || 'conta atual'}
          onBackToPublic={() =>
            navigate({
              isAdmin: false,
              isDemoMode: route.isDemoMode,
              adminFocusReminders: false,
              storeId: route.storeId || 'clinica-sorriso',
              segmentPreview: null,
              manageToken: null,
            })
          }
        />
      );
    }

    return (
      <AdminPanel
        user={authUser}
        darkMode={darkMode}
        initialFocusReminders={route.adminFocusReminders}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onViewPublicStore={(storeId) =>
          navigate({
            isAdmin: false,
            isDemoMode: false,
            adminFocusReminders: false,
            storeId,
            segmentPreview: null,
            manageToken: null,
          })
        }
      />
    );
  }

  // Loading storefront
  if (loadingStore || !bundle) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-6">
        <div className="space-y-2 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-stone-300 dark:border-stone-700 border-t-stone-900 dark:border-t-stone-100 animate-spin mx-auto" />
          <p className="text-xs text-stone-500">Carregando agenda...</p>
        </div>
      </div>
    );
  }

  // 2. CLIENT SELF-SERVICE LINK (?loja=...&reserva=<token>)
  if (route.manageToken) {
    return (
      <ClientManageBooking
        store={bundle.store}
        services={bundle.services}
        staff={bundle.staff}
        slotLocks={bundle.slotLocks}
        token={route.manageToken}
        onBackToStore={() =>
          navigate({
            isAdmin: false,
            isDemoMode: route.isDemoMode,
            adminFocusReminders: false,
            storeId: bundle.store.storeId,
            segmentPreview: route.segmentPreview,
            manageToken: null,
          })
        }
        onRefreshLocks={refreshPublicStore}
      />
    );
  }

  // 3. PUBLIC CONVERSION STOREFRONT (?loja=... or ?modelo=... with optional ?demo=1)
  return (
    <>
      <PublicStorefront
        store={bundle.store}
        services={bundle.services}
        staff={bundle.staff}
        slotLocks={bundle.slotLocks}
        isDemoMode={route.isDemoMode}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onOpenBooking={(serviceId, staffId) =>
          setBookingModal({ open: true, serviceId: serviceId ?? null, staffId: staffId ?? null })
        }
        onSelectStoreId={(storeId) =>
          navigate({
            isAdmin: false,
            isDemoMode: route.isDemoMode,
            adminFocusReminders: false,
            storeId,
            segmentPreview: null,
            manageToken: null,
          })
        }
        onSelectSegmentPreview={(segment) =>
          navigate({
            isAdmin: false,
            isDemoMode: route.isDemoMode,
            adminFocusReminders: false,
            storeId: SEGMENT_TEMPLATES[segment].store.storeId,
            segmentPreview: segment,
            manageToken: null,
          })
        }
        onOpenAdmin={() =>
          navigate({
            isAdmin: true,
            isDemoMode: route.isDemoMode,
            adminFocusReminders: false,
            storeId: bundle.store.storeId,
            segmentPreview: null,
            manageToken: null,
          })
        }
      />

      <BookingFlowModal
        open={bookingModal.open}
        store={bundle.store}
        services={bundle.services}
        staff={bundle.staff}
        slotLocks={bundle.slotLocks}
        initialServiceId={bookingModal.serviceId}
        initialStaffId={bookingModal.staffId}
        onClose={() => setBookingModal({ open: false })}
        onBooked={() => {
          refreshPublicStore();
        }}
        onOpenManageLink={(token) =>
          navigate({
            isAdmin: false,
            isDemoMode: route.isDemoMode,
            adminFocusReminders: false,
            storeId: bundle.store.storeId,
            segmentPreview: route.segmentPreview,
            manageToken: token,
          })
        }
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
