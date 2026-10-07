import React from 'react';
import { ContainerStatus, StorageLocation, TransactionType, UserRole } from '../types/inventory';
import { AppLanguage, useLanguage } from '../context/LanguageContext';

function getStoredLang(): AppLanguage {
  try {
    const saved = localStorage.getItem('lcsco_app_language');
    return saved === 'fr' ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

export function formatTimestamp(ts: unknown): string {
  const lang = getStoredLang();
  if (!ts) return '—';
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return isNaN(d.getTime())
      ? ts
      : d.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
  }
  if (typeof (ts as any).toDate === 'function') {
    return (ts as any).toDate().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return String(ts);
}

export const LCSCO_FOUR_ACCOUNT_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PROFESSOR,
  UserRole.TECHNICIAN,
  UserRole.STUDENT_RESEARCHER,
];

/**
 * Formats the 4 official laboratory roles:
 * 1. DIRECTOR — Full Administrator (`UserRole.ADMIN`)
 * 2. PROFESSOR — Supervisor / Research Group Manager (`UserRole.PROFESSOR`)
 * 3. LAB ENGINEER — Operational Inventory Manager (`UserRole.TECHNICIAN`)
 * 4. PHD STUDENT — Researcher / Inventory User (`UserRole.STUDENT_RESEARCHER` / `UserRole.PHD_STUDENT`)
 */
export function formatRoleLabel(role: UserRole, customLang?: AppLanguage): string {
  const lang = customLang || getStoredLang();
  switch (role) {
    case UserRole.ADMIN:
      return lang === 'fr' ? 'Directeur (Administrateur Complet)' : 'Director (Full Administrator)';
    case UserRole.PROFESSOR:
      return lang === 'fr' ? 'Professeur (Superviseur)' : 'Professor (Supervisor)';
    case UserRole.TECHNICIAN:
      return lang === 'fr'
        ? 'Ingénieur de Laboratoire (Gestionnaire Opérationnel)'
        : 'Lab Engineer (Operational Inventory Manager)';
    case UserRole.STUDENT_RESEARCHER:
      return lang === 'fr' ? 'Doctorant (Chercheur)' : 'PhD Student (Researcher)';
    case UserRole.GUEST:
    default:
      return lang === 'fr' ? 'Invité' : 'Guest';
  }
}

export function formatShortRoleName(role: UserRole): string {
  const lang = getStoredLang();
  switch (role) {
    case UserRole.ADMIN:
      return lang === 'fr' ? 'Directeur' : 'Director';
    case UserRole.PROFESSOR:
      return lang === 'fr' ? 'Professeur' : 'Professor';
    case UserRole.TECHNICIAN:
      return lang === 'fr' ? 'Ingénieur Labo' : 'Lab Engineer';
    case UserRole.STUDENT_RESEARCHER:
      return lang === 'fr' ? 'Doctorant' : 'PhD Student';
    case UserRole.GUEST:
    default:
      return lang === 'fr' ? 'Invité' : 'Guest';
  }
}

export function getCabinetDescriptiveLabel(unitCode: string): string {
  const clean = (unitCode || '').trim().toUpperCase();
  if (clean === 'A' || clean === 'CAB-A' || clean.startsWith('FLAM')) return 'Cabinet A — Flammable Solvents';
  if (clean === 'B' || clean === 'CAB-B' || clean.startsWith('HALO')) return 'Cabinet B — Halogenated Solvents';
  if (clean === 'C' || clean === 'CAB-C' || clean.startsWith('ACID')) return 'Cabinet C — Corrosive Acids';
  if (clean === 'D' || clean === 'CAB-D' || clean.startsWith('BASE')) return 'Cabinet D — Corrosive Bases & Amines';
  if (clean === 'E' || clean === 'CAB-E' || clean.startsWith('OXID')) return 'Cabinet E — Oxidizing Agents';
  if (clean === 'F' || clean === 'CAB-F' || clean.startsWith('DESC')) return 'Cabinet F — Reducing Agents & Desiccator';
  if (clean === 'G' || clean === 'CAB-G' || clean.startsWith('CAB-02')) return 'Cabinet G — Inorganic Salts & Minerals';
  if (clean === 'H' || clean === 'CAB-H' || clean.startsWith('SYN')) return 'Cabinet H — Organic Synthesis & Heterocycles';
  if (clean === 'I' || clean === 'CAB-I' || clean.startsWith('GLOVE')) return 'Cabinet I — Organometallics & Catalysts';
  if (clean === 'J' || clean === 'CAB-J' || clean.startsWith('COLD')) return 'Cabinet J — Cold Storage & Buffers (+4°C)';
  return 'Storage Cabinet';
}

export function extractPhysicalLocationFields(location: StorageLocation): {
  room: string;
  cabinet: string;
  cabinetLabel: string;
  side: 'Left' | 'Right';
  shelf: string;
  position: string;
  code: string;
} {
  const room = location.room || '204';
  const cabinet = location.unit || 'A';
  const cabinetLabel = location.cabinetLabel || getCabinetDescriptiveLabel(cabinet);
  let side: 'Left' | 'Right' = location.side || 'Left';
  if (!location.side && location.code) {
    if (location.code.includes('-R-')) side = 'Right';
    else if (location.code.includes('-L-')) side = 'Left';
  }
  const shelf = String(location.shelf || '1').replace(/^S/i, '').replace(/^0+/, '') || '1';
  const position = String(location.position || '01').replace(/^P/i, '').padStart(2, '0');
  const code = location.code;
  return { room, cabinet, cabinetLabel, side, shelf, position, code };
}

export const StatusIndicator: React.FC<{ status: ContainerStatus }> = ({ status }) => {
  const { language } = useLanguage();

  switch (status) {
    case ContainerStatus.NORMAL:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-emerald-700">
          <span className="text-emerald-600" aria-hidden="true">●</span>
          <span>{language === 'fr' ? 'Disponible' : 'Available'}</span>
        </span>
      );
    case ContainerStatus.LOW_STOCK:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-amber-700">
          <span className="text-amber-600" aria-hidden="true">▲</span>
          <span>{language === 'fr' ? 'Stock faible' : 'Low stock'}</span>
        </span>
      );
    case ContainerStatus.NEARLY_EMPTY:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-orange-700">
          <span className="text-orange-600" aria-hidden="true">▼</span>
          <span>{language === 'fr' ? 'Rupture / Critique' : 'Nearly empty'}</span>
        </span>
      );
    case ContainerStatus.NEEDS_IDENTIFICATION:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-rose-700">
          <span className="text-rose-600" aria-hidden="true">◆</span>
          <span>{language === 'fr' ? 'À vérifier' : 'Needs ID'}</span>
        </span>
      );
    case ContainerStatus.QUARANTINED:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-rose-800">
          <span className="text-rose-700" aria-hidden="true">✖</span>
          <span>{language === 'fr' ? 'Quarantaine' : 'Quarantined'}</span>
        </span>
      );
    case ContainerStatus.DISPOSAL_REQUIRED:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700">
          <span className="text-slate-600" aria-hidden="true">■</span>
          <span>{language === 'fr' ? 'Élimination' : 'Disposal req.'}</span>
        </span>
      );
    case ContainerStatus.EXPIRED:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-rose-700">
          <span className="text-rose-600" aria-hidden="true">!</span>
          <span>{language === 'fr' ? 'Expiré' : 'Expired'}</span>
        </span>
      );
    default:
      return <span className="font-mono text-xs text-slate-600">{status}</span>;
  }
};

export const TransactionTypeLabel: React.FC<{ type: TransactionType }> = ({ type }) => {
  const { language } = useLanguage();

  switch (type) {
    case TransactionType.WITHDRAWAL:
      return (
        <span className="font-mono text-xs font-semibold text-amber-800">
          {language === 'fr' ? '− Consommation' : '− Consumption'}
        </span>
      );
    case TransactionType.ADDITION:
      return (
        <span className="font-mono text-xs font-semibold text-emerald-800">
          {language === 'fr' ? '+ Entrée stock' : '+ Stock entry'}
        </span>
      );
    case TransactionType.CORRECTION:
      return (
        <span className="font-mono text-xs font-semibold text-blue-800">
          {language === 'fr' ? '± Ajustement stock' : '± Quantity adjustment'}
        </span>
      );
    case TransactionType.TRANSFER:
      return (
        <span className="font-mono text-xs font-semibold text-slate-700">
          {language === 'fr' ? '⇄ Déplacement' : '⇄ Location transfer'}
        </span>
      );
    case TransactionType.STATUS_CHANGE:
      return (
        <span className="font-mono text-xs font-semibold text-rose-800">
          {language === 'fr' ? '⚑ Changement statut' : '⚑ Status change'}
        </span>
      );
    default:
      return <span className="font-mono text-xs">{type}</span>;
  }
};
