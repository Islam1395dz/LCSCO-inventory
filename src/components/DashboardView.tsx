import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  FlaskConical,
  QrCode,
  Repeat,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  ContainerStatus,
  StockRuptureStatus,
} from '../types/inventory';
import {
  formatRoleLabel,
  formatTimestamp,
  TransactionTypeLabel,
} from '../utils/formatters';
import { Button, PageHeader, StatusBadge } from './DesignSystem';

interface DashboardViewProps {
  onSelectContainer: (containerId: string) => void;
  onNavigate: (view: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectContainer,
  onNavigate,
}) => {
  const {
    profile,
    containers,
    products,
    transactions,
    adjustmentRequests,
    disposalRequests,
    purchaseRequests,
    stockRuptureRequests,
    isAdmin,
    isProfessor,
    isTechnician,
    isPhdStudent,
  } = useInventoryContext();

  const { language, tr } = useLanguage();

  const productMap = React.useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  // Core Inventory Metrics
  const totalContainers = containers.length;
  const lowOrNearlyEmpty = containers.filter(
    (c) =>
      c.status === ContainerStatus.LOW_STOCK ||
      c.status === ContainerStatus.NEARLY_EMPTY
  );

  const nowDate = new Date('2026-10-06T00:00:00Z');
  const expiredOrExpiring = containers.filter((c) => {
    const exp = new Date(c.expiryDate);
    if (isNaN(exp.getTime())) return false;
    const diffDays = (exp.getTime() - nowDate.getTime()) / (1000 * 3600 * 24);
    return diffDays <= 180;
  });

  // Pending Approvals & Active Ruptures
  const pendingAdjustments = adjustmentRequests.filter((a) => a.status === 'PENDING');
  const pendingDisposals = disposalRequests.filter((d) => d.status === 'REQUESTED');
  const pendingPurchases = purchaseRequests.filter((p) => p.status === 'REQUESTED');
  const incomingDeliveries = purchaseRequests.filter(
    (p) => p.status === 'APPROVED' || p.status === 'ORDERED'
  );
  const activeRuptures = stockRuptureRequests.filter(
    (r) =>
      r.status !== StockRuptureStatus.RESOLVED &&
      r.status !== StockRuptureStatus.REJECTED
  );

  const myPurchaseRequests = purchaseRequests.filter(
    (p) => p.requestedByUid === profile?.uid
  );
  const myDisposalRequests = disposalRequests.filter(
    (d) => d.requestedByUid === profile?.uid
  );

  const totalPendingRequests = isPhdStudent
    ? myPurchaseRequests.length + myDisposalRequests.length
    : isTechnician
    ? incomingDeliveries.length + pendingAdjustments.length + activeRuptures.length
    : pendingPurchases.length +
      pendingDisposals.length +
      pendingAdjustments.length +
      activeRuptures.length;

  return (
    <div className="space-y-8">
      {/* Clean Page Header with Role Context & Focused Primary Action */}
      <PageHeader
        title={
          isAdmin
            ? tr('Laboratory Overview', 'Vue d’ensemble du laboratoire')
            : isProfessor
            ? tr('Supervision & Research Group', 'Supervision & Groupe de recherche')
            : isTechnician
            ? tr('Inventory Operations', 'Opérations d’inventaire')
            : tr('Researcher Workspace', 'Espace chercheur')
        }
        subtitle={`${profile?.fullName || ''} · ${
          profile ? formatRoleLabel(profile.role, language) : ''
        }`}
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate('movements')}>
              <Repeat className="w-3.5 h-3.5 text-slate-600" />
              <span>{tr('Record Movement', 'Enregistrer un mouvement')}</span>
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('requests')}>
              <ClipboardList className="w-3.5 h-3.5 text-slate-600" />
              <span>{tr('New Request', 'Nouvelle demande')}</span>
            </Button>
            <Button variant="primary" onClick={() => onNavigate('scanner')}>
              <QrCode className="w-3.5 h-3.5" />
              <span>{tr('Scan QR', 'Scanner QR')}</span>
            </Button>
          </>
        }
      />

      {/* 4 Focused Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">
            {tr('Active Reagents & Solvents', 'Réactifs & solvants actifs')}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {totalContainers}
            </span>
            <span className="text-xs text-slate-500">
              {products.length} {tr('catalog references', 'références')}
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white border border-slate-200 rounded-md p-4 hover:border-amber-400 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">
            {tr('Low Stock & Ruptures', 'Stock faible & ruptures')}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-amber-700">
              {lowOrNearlyEmpty.length + activeRuptures.length}
            </span>
            <span className="text-xs text-slate-500">
              {activeRuptures.length} {tr('rupture reports', 'ruptures signalées')}
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white border border-slate-200 rounded-md p-4 hover:border-orange-400 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">
            {tr('Expiration Alerts', 'Alertes d’expiration')}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-orange-700">
              {expiredOrExpiring.length}
            </span>
            <span className="text-xs text-slate-500">
              {tr('<= 6 months', '<= 6 mois')}
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('requests')}
          className="bg-white border border-slate-200 rounded-md p-4 hover:border-[#1B8A2A] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">
            {isPhdStudent
              ? tr('My Open Requests', 'Mes demandes en cours')
              : isTechnician
              ? tr('Operational Tasks', 'Tâches opérationnelles')
              : tr('Pending Approvals', 'Demandes en attente')}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#1B8A2A]">
              {totalPendingRequests}
            </span>
            <span className="text-xs text-[#1B8A2A] font-medium inline-flex items-center gap-1">
              <span>{tr('Review', 'Consulter')}</span>
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Split: Priority Alerts & Approvals vs Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Priority Alerts & Pending Requests */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {tr('Priority Alerts & Pending Requests', 'Alertes prioritaires & demandes en attente')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('requests')}
              className="text-xs font-medium text-[#1B8A2A] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{tr('View all requests', 'Voir toutes les demandes')}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100 text-xs">
            {/* Active Stock Ruptures */}
            {activeRuptures.slice(0, 3).map((rup) => (
              <div
                key={rup.ruptureId}
                onClick={() => onNavigate('requests')}
                className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span className="font-semibold text-slate-900 truncate">
                      {rup.chemicalName}
                    </span>
                    <span className="font-mono text-slate-500">({rup.containerId})</span>
                  </div>
                  <p className="text-slate-500 truncate">
                    {tr('Stock rupture reported by', 'Rupture signalée par')}{' '}
                    {rup.reportedByName} · {rup.comment || tr('Urgent check', 'Vérification requise')}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={rup.status} />
                </div>
              </div>
            ))}

            {/* Low Stock Bottles */}
            {lowOrNearlyEmpty.slice(0, 3).map((c) => {
              const prod = productMap.get(c.productId);
              return (
                <div
                  key={c.containerId}
                  onClick={() => onSelectContainer(c.containerId)}
                  className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-semibold text-slate-900 truncate">
                        {prod?.chemicalName || c.productId}
                      </span>
                      <span className="font-mono text-slate-500">({c.containerId})</span>
                    </div>
                    <p className="text-slate-500 font-mono">
                      {tr('Remaining:', 'Restant :')} {c.currentQuantity} / {c.initialQuantity}{' '}
                      {c.unit} · {c.location.unit} (Rm {c.location.room})
                    </p>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={c.status} expiryDate={c.expiryDate} />
                  </div>
                </div>
              );
            })}

            {/* Pending Purchase Requests */}
            {pendingPurchases.slice(0, 2).map((pur) => (
              <div
                key={pur.purchaseId}
                onClick={() => onNavigate('requests')}
                className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {tr('Purchase Request:', 'Demande d’achat :')} {pur.chemicalName} (
                    {pur.requestedQuantity} {pur.unit})
                  </div>
                  <p className="text-slate-500 truncate">
                    {pur.requestedByName} · {pur.reason}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={pur.status} />
                </div>
              </div>
            ))}

            {activeRuptures.length === 0 &&
              lowOrNearlyEmpty.length === 0 &&
              pendingPurchases.length === 0 && (
                <div className="p-6 text-center text-slate-500">
                  {tr(
                    'All stock levels and requests are nominal.',
                    'Tous les niveaux de stock et demandes sont normaux.'
                  )}
                </div>
              )}
          </div>
        </div>

        {/* Right Column (5 cols): Recent Stock Movements */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {tr('Recent Stock Movements', 'Mouvements récents')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-[#1B8A2A] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{tr('Full history', 'Tout l’historique')}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100 text-xs">
            {transactions.slice(0, 5).map((tx) => {
              const prod = productMap.get(tx.productId);
              return (
                <div
                  key={tx.transactionId}
                  onClick={() => onSelectContainer(tx.containerId)}
                  className="p-3.5 hover:bg-slate-50 transition-colors cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-[#1E3A8A]">
                        {tx.containerId}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-medium text-slate-900 truncate">
                        {prod?.chemicalName || tx.productId}
                      </span>
                    </div>
                    <span
                      className={`font-mono font-semibold tabular-nums shrink-0 ${
                        tx.quantityChange < 0
                          ? 'text-amber-700'
                          : tx.quantityChange > 0
                          ? 'text-emerald-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {tx.quantityChange > 0 ? `+${tx.quantityChange}` : tx.quantityChange}{' '}
                      {tx.unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <TransactionTypeLabel type={tx.type} />
                    <span className="font-mono">
                      {tx.userName.split('(')[0].trim()} ·{' '}
                      {formatTimestamp(tx.timestamp).split(',')[0]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
