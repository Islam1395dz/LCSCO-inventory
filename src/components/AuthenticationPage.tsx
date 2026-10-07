import React, { useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  User,
} from 'lucide-react';
import {
  TEMPORARY_LCSCO_ACCOUNTS,
  useInventoryContext,
} from '../context/AuthContext';
import {
  LanguageSwitchButton,
  useLanguage,
} from '../context/LanguageContext';
import { formatRoleLabel, formatShortRoleName } from '../utils/formatters';
import { LCSCOLogo } from './LCSCOLogo';

export const AuthenticationPage: React.FC = () => {
  const {
    loginWithTemporaryAccount,
    allUsers,
    signInWithGoogle,
    error,
    clearError,
  } = useInventoryContext();

  const { tr } = useLanguage();

  const [usernameOrEmail, setUsernameOrEmail] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalAuthError(null);

    const trimmedUser = usernameOrEmail.trim().toLowerCase();
    const isLabEngineerAlias =
      trimmedUser === 'lab engineer' ||
      trimmedUser === 'ingénieur labo' ||
      trimmedUser === 'ingénieur de laboratoire' ||
      trimmedUser === 'lab.engineer@lcsco.dz' ||
      trimmedUser === 'technician' ||
      trimmedUser === 'technicien' ||
      trimmedUser === 'technician@lcsco.dz';

    const matchedUser =
      allUsers.find(
        (u) =>
          u.fullName.toLowerCase() === trimmedUser ||
          u.email.toLowerCase() === trimmedUser ||
          u.uid.toLowerCase() === trimmedUser ||
          formatRoleLabel(u.role, 'fr').toLowerCase() === trimmedUser ||
          formatRoleLabel(u.role, 'en').toLowerCase() === trimmedUser ||
          (isLabEngineerAlias && u.uid === 'temp-technician')
      ) ||
      TEMPORARY_LCSCO_ACCOUNTS.find(
        (acc) =>
          acc.fullName.toLowerCase() === trimmedUser ||
          acc.email.toLowerCase() === trimmedUser ||
          formatRoleLabel(acc.role, 'fr').toLowerCase() === trimmedUser ||
          formatRoleLabel(acc.role, 'en').toLowerCase() === trimmedUser
      );

    if (!matchedUser) {
      setLocalAuthError(
        tr(
          'Account not found. In trial mode, enter "Director" (password: LCSCO2026) or use an account created by the Director.',
          'Compte introuvable. En mode essai, entrez « Director » (mot de passe : LCSCO2026) ou utilisez un compte créé par le Directeur.'
        )
      );
      return;
    }

    const savedCustomPassword = localStorage.getItem(`lcsco_pass_${matchedUser.uid}`);
    const expectedPassword =
      savedCustomPassword ||
      (matchedUser as any).password ||
      (matchedUser as any).accessCode ||
      'LCSCO2026';

    const cleanPass = passwordInput.trim();
    const isDirectorDefaultPass =
      matchedUser.uid === 'temp-director' &&
      !savedCustomPassword &&
      (cleanPass === 'LCSCO2026' || cleanPass === 'LCSCO-2026');

    if (cleanPass !== expectedPassword && !isDirectorDefaultPass) {
      setLocalAuthError(
        tr(
          'Invalid password for this LCSCO account.',
          'Mot de passe incorrect pour ce compte LCSCO.'
        )
      );
      return;
    }

    loginWithTemporaryAccount(matchedUser.uid);
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Top Language Switcher */}
        <div className="flex justify-end">
          <LanguageSwitchButton />
        </div>

        {/* Clean LCSCO Institutional Logo & Header */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <LCSCOLogo size="lg" />
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {tr('LCSCO Inventory', 'LCSCO Inventaire')}
            </h1>
            <p className="text-xs font-medium text-[#1E3A8A]">
              Laboratoire de Catalyse et Synthèse en Chimie Organique
            </p>
          </div>
        </div>

        {/* Clean Standard Login Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 sm:p-8 space-y-5">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {tr('Sign In', 'Connexion')}
              </h2>
              <p className="text-xs text-slate-500">
                {tr(
                  'Enter your laboratory credentials to access the inventory',
                  'Saisissez vos identifiants pour accéder à l’inventaire'
                )}
              </p>
            </div>
            <span className="font-mono text-[11px] font-semibold text-[#1B8A2A] bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded">
              {tr('LCSCO Lab', 'Labo LCSCO')}
            </span>
          </div>

          {/* Trial Mode Director Account Reminder */}
          <div className="p-3.5 rounded-lg bg-amber-50/90 border border-amber-200 text-xs text-amber-950 space-y-1.5">
            <div className="font-semibold text-amber-900 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>
                {tr(
                  'Trial Mode Reminder — Director Account Open',
                  'Rappel Mode Test — Compte Directeur ouvert'
                )}
              </span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              {tr(
                'Since this application is in trial mode, the Director account is open. Simply enter ',
                'Comme cette application est en mode test, le compte Directeur est ouvert. Écrivez simplement '
              )}
              <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-amber-200 text-slate-900">
                Director
              </span>
              {tr(' and the password ', ' et le mot de passe ')}
              <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-amber-200 text-slate-900">
                LCSCO2026
              </span>
              {tr('.', '.')}
            </p>
          </div>

          {(error || localAuthError) && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-900 flex items-center justify-between">
              <span>{error || localAuthError}</span>
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setLocalAuthError(null);
                }}
                className="underline font-mono ml-3 cursor-pointer"
              >
                {tr('Dismiss', 'Fermer')}
              </button>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                {tr('Username or Email', 'Nom d’utilisateur ou E-mail')}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder={tr(
                    'Director or your laboratory email',
                    'Director ou votre e-mail du laboratoire'
                  )}
                  className="w-full pl-9 pr-3 py-2.5 font-mono text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-slate-700">
                  {tr('Password', 'Mot de passe')}
                </label>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={tr('Enter password', 'Entrez le mot de passe')}
                  className="w-full pl-9 pr-9 py-2.5 font-mono text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#1B8A2A] rounded-md hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{tr('Log In', 'Se Connecter')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-[#1B8A2A]" />
              <span>{tr('Sign In with Google', 'Continuer avec Google')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
