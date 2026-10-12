/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  FlaskConical,
  Globe,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Mic,
  QrCode,
  Repeat,
  Settings,
  ShieldCheck,
  UserCircle,
  X,
} from 'lucide-react';
import { AuthAndInventoryProvider, useInventoryContext } from './context/AuthContext';
import {
  LanguageProvider,
  useLanguage,
} from './context/LanguageContext';
import { DashboardView } from './components/DashboardView';
import { InventoryTableView } from './components/InventoryTableView';
import { MovementsView } from './components/MovementsView';
import { RequestsView } from './components/RequestsView';
import { QRScannerView } from './components/QRScannerView';
import { HistoryView } from './components/HistoryView';
import { ContainerDetailView } from './components/ContainerDetailView';
import { UserManagementView } from './components/UserManagementView';
import { SettingsView } from './components/SettingsView';
import { CatalogAndAdminView } from './components/CatalogAndAdminView';
import { AuthenticationPage } from './components/AuthenticationPage';
import { NotificationCenter } from './components/NotificationCenter';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LCSCOLogo } from './components/LCSCOLogo';
import { JarvisAssistant } from './components/JarvisAssistant';
import { formatRoleLabel, formatShortRoleName } from './utils/formatters';

export type AppRoute =
  | 'dashboard'   // Accueil
  | 'inventory'   // Réactifs
  | 'movements'   // Mouvements
  | 'requests'    // Demandes
  | 'scanner'     // Scanner
  | 'history'     // Historique
  | 'users'       // Utilisateurs (Director only)
  | 'settings'    // Paramètres
  | 'container';  // Detail view

const TrialModeBanner: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="print:hidden w-full bg-amber-50/95 backdrop-blur-xs border-b border-amber-200/80 text-amber-950 px-3 sm:px-6 py-1.5"
  >
    <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-center">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      <p className="text-[11px] sm:text-xs font-medium leading-snug tracking-tight text-amber-900">
        MODE TEST — Cette application est actuellement en phase d’essai. Les données peuvent être modifiées ou supprimées pendant le développement.
      </p>
    </div>
  </div>
);

const MainShell: React.FC = () => {
  const {
    firebaseUser,
    profile,
    isPreviewMode,
    updatePreviewState,
    authReady,
    error,
    clearError,
    signOut,
    isAdmin,
  } = useInventoryContext();

  const { language, toggleLanguage, tr } = useLanguage();

  const [activeRoute, setActiveRoute] = useState<AppRoute>('dashboard');
  const [selectedContainerId, setSelectedContainerId] = useState<string>('SOL-001');
  const [settingsSection, setSettingsSection] = useState<
    'PROFILE' | 'LOCATIONS' | 'LABELS' | 'CALCULATOR' | 'GUIDE'
  >('PROFILE');
  const [labelPrintIds, setLabelPrintIds] = useState<string[] | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [jarvisOpen, setJarvisOpen] = useState<boolean>(false);

  // First-login mandatory password change state
  const [firstLoginNewPass, setFirstLoginNewPass] = useState<string>('');
  const [firstLoginConfirmPass, setFirstLoginConfirmPass] = useState<string>('');
  const [showFirstLoginPass, setShowFirstLoginPass] = useState<boolean>(false);
  const [firstLoginError, setFirstLoginError] = useState<string | null>(null);

  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const hash = window.location.hash;
      const path = window.location.pathname;
      if (hash.startsWith('#/container/')) {
        const cid = decodeURIComponent(hash.replace('#/container/', '')).trim().toUpperCase();
        if (cid) {
          setSelectedContainerId(cid);
          setActiveRoute('container');
        }
      } else if (path.startsWith('/container/')) {
        const cid = decodeURIComponent(path.replace('/container/', '')).trim().toUpperCase();
        if (cid) {
          setSelectedContainerId(cid);
          setActiveRoute('container');
        }
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);

  const navigateToContainer = (containerId: string) => {
    const cleanId = containerId.trim().toUpperCase();
    setSelectedContainerId(cleanId);
    setActiveRoute('container');
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    try {
      window.location.hash = `/container/${cleanId}`;
    } catch {
      // Ignore hash restrictions
    }
  };

  const navigateToRoute = (route: Exclude<AppRoute, 'container'>) => {
    setActiveRoute(route);
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    try {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch {
      // Ignore history API restrictions
    }
  };

  const handlePrintLabels = (ids: string[]) => {
    setLabelPrintIds(ids);
    setSettingsSection('LABELS');
    navigateToRoute('settings');
  };

  const handleOpenCalculator = () => {
    setSettingsSection('CALCULATOR');
    navigateToRoute('settings');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <div className="sticky top-0 z-40 w-full">
          <TrialModeBanner />
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <LCSCOLogo size="lg" />
            </div>
            <div className="font-mono text-xs text-slate-500">
              {tr('Initializing LCSCO Inventory...', 'Initialisation de LCSCO Inventaire...')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser && !isPreviewMode) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <div className="sticky top-0 z-40 w-full">
          <TrialModeBanner />
        </div>
        <div className="flex-1 flex flex-col">
          <AuthenticationPage />
        </div>
      </div>
    );
  }

  const requiresPasswordChange =
    Boolean(profile?.mustChangePassword) ||
    Boolean(profile?.uid && localStorage.getItem(`lcsco_must_change_pass_${profile.uid}`) === 'true');

  if (profile && requiresPasswordChange) {
    const currentTempPassword =
      localStorage.getItem(`lcsco_pass_${profile.uid}`) ||
      profile.password ||
      'LCSCO-2026';

    const handleCompleteFirstLoginPasswordChange = (e: React.FormEvent) => {
      e.preventDefault();
      setFirstLoginError(null);
      const trimmedNew = firstLoginNewPass.trim();
      const trimmedConfirm = firstLoginConfirmPass.trim();

      if (trimmedNew.length < 6) {
        setFirstLoginError(
          tr(
            'New password must be at least 6 characters long.',
            'Le nouveau mot de passe doit contenir au moins 6 caractères.'
          )
        );
        return;
      }

      if (trimmedNew === currentTempPassword) {
        setFirstLoginError(
          tr(
            'Your new personal password must be different from the temporary password assigned by the Director.',
            'Votre nouveau mot de passe personnel doit être différent du mot de passe temporaire attribué par le Directeur.'
          )
        );
        return;
      }

      if (trimmedNew !== trimmedConfirm) {
        setFirstLoginError(
          tr(
            'New password and confirmation do not match.',
            'Le nouveau mot de passe et sa confirmation ne correspondent pas.'
          )
        );
        return;
      }

      localStorage.setItem(`lcsco_pass_${profile.uid}`, trimmedNew);
      localStorage.removeItem(`lcsco_must_change_pass_${profile.uid}`);

      updatePreviewState({
        currentProfile: {
          password: trimmedNew,
          mustChangePassword: false,
          lastLogin: new Date().toISOString(),
        },
      });

      setFirstLoginNewPass('');
      setFirstLoginConfirmPass('');
      setFirstLoginError(null);
    };

    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col text-slate-900">
        <div className="sticky top-0 z-40 w-full">
          <TrialModeBanner />
        </div>

        <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6">
          <div className="w-full max-w-md space-y-5">
            <div className="flex flex-col items-center text-center space-y-2">
              <LCSCOLogo size="md" />
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                {tr('First Login Security Step', 'Sécurité — Première connexion')}
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {tr(
                  'Modify Your Temporary Password',
                  'Modifiez votre mot de passe temporaire'
                )}
              </h1>
              <p className="text-xs text-slate-600 max-w-sm">
                {tr(
                  'The Director created your account with a temporary password. You must choose a new personal password before accessing LCSCO Inventory.',
                  'Le Directeur a créé votre compte avec un mot de passe temporaire. Vous devez définir un nouveau mot de passe personnel avant d’accéder à LCSCO Inventaire.'
                )}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 space-y-5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{profile.fullName}</div>
                  <div className="font-mono text-[11px] text-slate-500 truncate">
                    {profile.email}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[#1B8A2A] font-semibold text-[11px] shrink-0">
                  {formatRoleLabel(profile.role, language)}
                </span>
              </div>

              {firstLoginError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{firstLoginError}</span>
                </div>
              )}

              <form onSubmit={handleCompleteFirstLoginPasswordChange} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    {tr('New Personal Password *', 'Nouveau mot de passe personnel *')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showFirstLoginPass ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={firstLoginNewPass}
                      onChange={(e) => setFirstLoginNewPass(e.target.value)}
                      placeholder={tr(
                        'At least 6 characters (different from temporary)',
                        'Au moins 6 caractères (différent du temporaire)'
                      )}
                      className="w-full pl-9 pr-9 py-2.5 font-mono text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFirstLoginPass((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showFirstLoginPass ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    {tr('Confirm New Password *', 'Confirmer le nouveau mot de passe *')}
                  </label>
                  <div className="relative">
                    <CheckCircle2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showFirstLoginPass ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={firstLoginConfirmPass}
                      onChange={(e) => setFirstLoginConfirmPass(e.target.value)}
                      placeholder={tr(
                        'Re-enter your new password',
                        'Saisissez à nouveau votre mot de passe'
                      )}
                      className="w-full pl-9 pr-3 py-2.5 font-mono text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
                    />
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs font-semibold text-white bg-[#1B8A2A] rounded-md hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>
                      {tr(
                        'Save New Password & Access Inventory',
                        'Enregistrer le nouveau mot de passe et accéder à l’inventaire'
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFirstLoginNewPass('');
                      setFirstLoginConfirmPass('');
                      setFirstLoginError(null);
                      signOut();
                    }}
                    className="w-full py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{tr('Cancel & Sign Out', 'Annuler et se déconnecter')}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const savedAvatar =
    profile?.avatarUrl ||
    (profile?.uid ? localStorage.getItem(`lcsco_avatar_${profile.uid}`) : null);

  const navItems: {
    id: Exclude<AppRoute, 'container'>;
    label: string;
    icon: React.FC<{ className?: string }>;
    visible: boolean;
  }[] = [
    {
      id: 'dashboard',
      label: tr('Home', 'Accueil'),
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: 'inventory',
      label: tr('Reagents', 'Réactifs'),
      icon: FlaskConical,
      visible: true,
    },
    {
      id: 'movements',
      label: tr('Movements', 'Mouvements'),
      icon: Repeat,
      visible: true,
    },
    {
      id: 'requests',
      label: tr('Requests', 'Demandes'),
      icon: ClipboardList,
      visible: true,
    },
    {
      id: 'scanner',
      label: tr('Scanner', 'Scanner'),
      icon: QrCode,
      visible: true,
    },
    {
      id: 'history',
      label: tr('History', 'Historique'),
      icon: Clock,
      visible: true,
    },
    {
      id: 'users',
      label: tr('Users', 'Utilisateurs'),
      icon: ShieldCheck,
      visible: isAdmin, // Role-adapted: PhD student, Professor, and Technician do not see Users admin
    },
    {
      id: 'settings',
      label: tr('Settings', 'Paramètres'),
      icon: Settings,
      visible: true,
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col w-full text-slate-900">
      {/* STICKY TOP BAR: Fixed Trial-Mode Banner + Main Header */}
      <div className="print:hidden sticky top-0 z-30 w-full">
        <TrialModeBanner />

        {/* SIMPLIFIED HEADER: LCSCO Inventaire | Primary Navigation | Notifications | User profile ▾ */}
        <header className="w-full bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Title */}
          <button
            type="button"
            onClick={() => navigateToRoute('dashboard')}
            className="flex items-center gap-2.5 text-left cursor-pointer shrink-0"
          >
            <LCSCOLogo size="sm" />
            <span className="text-base font-bold tracking-tight text-slate-900">
              {tr('LCSCO Inventory', 'LCSCO Inventaire')}
            </span>
          </button>

          {/* Zone 2: Clean Role-Adapted Navigation Links */}
          <nav className="hidden lg:flex items-center gap-5 text-xs font-medium text-slate-600">
            {visibleNavItems.map((item) => {
              const isActive =
                activeRoute === item.id ||
                (item.id === 'inventory' && activeRoute === 'container');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'settings') {
                      setSettingsSection('PROFILE');
                    }
                    navigateToRoute(item.id);
                  }}
                  className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2 decoration-[#1B8A2A]'
                      : 'hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: JARVIS Voice AI | Notifications | User Profile Dropdown ▾ | Mobile Menu */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setJarvisOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-mono font-semibold transition-all cursor-pointer ${
                jarvisOpen
                  ? 'bg-[#050B14] text-cyan-200 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                  : 'bg-[#050B14] text-cyan-100 border-cyan-500/40 hover:border-cyan-400'
              }`}
              title={tr(
                'Open JARVIS Voice Laboratory Assistant',
                'Ouvrir l’assistant vocal JARVIS'
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <Mic className="w-3.5 h-3.5 text-cyan-300" />
              <span className="hidden sm:inline">JARVIS</span>
            </button>

            <NotificationCenter
              onSelectContainer={navigateToContainer}
              onNavigateDashboard={() => navigateToRoute('dashboard')}
              onNavigateRequests={() => navigateToRoute('requests')}
            />

            {/* User Profile Dropdown Menu (Profile, Preferences, Language, Logout) */}
            {profile && (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-[10px] overflow-hidden shrink-0">
                    {savedAvatar ? (
                      <img
                        src={savedAvatar}
                        alt={profile.fullName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>{profile.fullName.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="hidden sm:inline text-xs font-medium text-slate-800 max-w-[120px] truncate">
                    {profile.fullName}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-md shadow-lg py-1.5 z-50 text-xs">
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <div className="font-semibold text-slate-900 truncate">
                        {profile.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {formatRoleLabel(profile.role, language)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSettingsSection('PROFILE');
                        navigateToRoute('settings');
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <UserCircle className="w-3.5 h-3.5 text-slate-400" />
                      <span>{tr('Profile', 'Profil')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSettingsSection('LOCATIONS');
                        navigateToRoute('settings');
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>{tr('Preferences & Tools', 'Préférences & Outils')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        toggleLanguage();
                        setProfileMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        <span>{tr('Language', 'Langue')}</span>
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-[#1B8A2A]">
                        {language === 'fr' ? 'FR → EN' : 'EN → FR'}
                      </span>
                    </button>

                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          signOut();
                        }}
                        className="w-full px-3.5 py-2 text-left text-rose-700 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{tr('Sign Out', 'Déconnexion')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle Menu"
              className="lg:hidden p-2 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Collapsible Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-2 gap-1.5">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeRoute === item.id ||
                  (item.id === 'inventory' && activeRoute === 'container');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'settings') {
                        setSettingsSection('PROFILE');
                      }
                      navigateToRoute(item.id);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        </header>
      </div>

      {/* Main Content Container with Generous Whitespace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-20 lg:pb-12">
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={clearError}
              className="font-mono underline ml-4 cursor-pointer"
            >
              {tr('Dismiss', 'Fermer')}
            </button>
          </div>
        )}

        {activeRoute === 'dashboard' && (
          <DashboardView
            onSelectContainer={navigateToContainer}
            onOpenJarvis={() => setJarvisOpen(true)}
            onNavigate={(r) => {
              if (r === 'calculator') {
                handleOpenCalculator();
              } else if (r === 'labels') {
                handlePrintLabels([]);
              } else {
                navigateToRoute(r);
              }
            }}
          />
        )}

        {activeRoute === 'inventory' && (
          <InventoryTableView
            onSelectContainer={navigateToContainer}
            onOpenAddModal={() => setShowAddModal(true)}
          />
        )}

        {activeRoute === 'movements' && (
          <MovementsView
            onSelectContainer={navigateToContainer}
            onOpenCalculator={handleOpenCalculator}
          />
        )}

        {activeRoute === 'requests' && (
          <RequestsView onSelectContainer={navigateToContainer} />
        )}

        {activeRoute === 'scanner' && (
          <QRScannerView onScanSuccess={navigateToContainer} />
        )}

        {activeRoute === 'history' && (
          <HistoryView onSelectContainer={navigateToContainer} />
        )}

        {activeRoute === 'users' && <UserManagementView />}

        {activeRoute === 'settings' && (
          <SettingsView
            initialSection={settingsSection}
            labelPrintIds={labelPrintIds}
          />
        )}

        {activeRoute === 'container' && (
          <ContainerDetailView
            containerId={selectedContainerId}
            onBack={() => navigateToRoute('inventory')}
            onSelectContainer={navigateToContainer}
          />
        )}

        <CatalogAndAdminView
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSelectContainer={navigateToContainer}
        />
      </main>

      <JarvisAssistant
        onSelectContainer={navigateToContainer}
        externalOpen={jarvisOpen}
        onExternalOpenChange={setJarvisOpen}
      />

      <OfflineIndicator />

      {/* Mobile Bottom Navigation Bar (5 core laboratory destinations) */}
      <nav className="print:hidden lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-5 h-14">
        <button
          type="button"
          onClick={() => navigateToRoute('dashboard')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'dashboard' ? 'text-[#1B8A2A] font-semibold' : 'text-slate-600'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>{tr('Home', 'Accueil')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigateToRoute('inventory')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'inventory' || activeRoute === 'container'
              ? 'text-[#1B8A2A] font-semibold'
              : 'text-slate-600'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          <span>{tr('Reagents', 'Réactifs')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigateToRoute('movements')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'movements' ? 'text-[#1B8A2A] font-semibold' : 'text-slate-600'
          }`}
        >
          <Repeat className="w-4 h-4" />
          <span>{tr('Movements', 'Mouvements')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigateToRoute('requests')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'requests' ? 'text-[#1B8A2A] font-semibold' : 'text-slate-600'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>{tr('Requests', 'Demandes')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigateToRoute('scanner')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'scanner' ? 'text-[#1B8A2A] font-semibold' : 'text-slate-600'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>{tr('Scanner', 'Scanner')}</span>
        </button>
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthAndInventoryProvider>
        <MainShell />
      </AuthAndInventoryProvider>
    </LanguageProvider>
  );
}
