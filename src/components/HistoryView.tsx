import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { PermissionAction, TransactionType } from '../types/inventory';
import { formatTimestamp, TransactionTypeLabel } from '../utils/formatters';
import { Button, PageHeader } from './DesignSystem';

interface HistoryViewProps {
  onSelectContainer: (containerId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onSelectContainer }) => {
  const {
    profile,
    transactions,
    products,
    canPerform,
    isPhdStudent,
  } = useInventoryContext();

  const { tr } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [onlyMine, setOnlyMine] = useState<boolean>(isPhdStudent);

  const productMap = useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (onlyMine && profile) {
        const matchUser =
          tx.userId === profile.uid ||
          tx.userName.toLowerCase().includes(profile.fullName.toLowerCase());
        if (!matchUser) return false;
      }
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const prod = productMap.get(tx.productId);
        const matchId = tx.containerId.toLowerCase().includes(q);
        const matchChem = prod?.chemicalName.toLowerCase().includes(q);
        const matchUser = tx.userName.toLowerCase().includes(q);
        const matchReason = tx.reason.toLowerCase().includes(q);
        if (!matchId && !matchChem && !matchUser && !matchReason) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, onlyMine, profile, typeFilter, searchQuery, productMap]);

  const handleExportAuditCSV = () => {
    const headers = [
      'TransactionID',
      'Timestamp',
      'Type',
      'ContainerID',
      'ChemicalName',
      'User',
      'Delta',
      'Before',
      'After',
      'Unit',
      'Location',
      'Reason',
    ];
    const rows = filteredTransactions.map((tx) => {
      const prod = productMap.get(tx.productId);
      return [
        tx.transactionId,
        `"${formatTimestamp(tx.timestamp)}"`,
        tx.type,
        tx.containerId,
        `"${(prod?.chemicalName || tx.productId).replace(/"/g, '""')}"`,
        `"${tx.userName.replace(/"/g, '""')}"`,
        tx.quantityChange,
        tx.quantityBefore,
        tx.quantityAfter,
        tx.unit,
        tx.newLocation,
        `"${tx.reason.replace(/"/g, '""')}"`,
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LCSCO_Audit_History_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr('Inventory History & Audit Log', 'Historique & Journal d’audit')}
        subtitle={tr(
          'Complete chronological ledger of reagent withdrawals, additions, transfers, and adjustments.',
          'Registre chronologique complet des prélèvements, entrées, transferts et ajustements de stock.'
        )}
        actions={
          canPerform(PermissionAction.EXPORT_REPORTS) ? (
            <Button variant="secondary" onClick={handleExportAuditCSV}>
              <Download className="w-3.5 h-3.5" />
              <span>{tr('Export CSV', 'Exporter CSV')}</span>
            </Button>
          ) : undefined
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr(
                'Search by bottle ID, chemical, user, or experiment...',
                'Rechercher par flacon, réactif, utilisateur ou motif...'
              )}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
          >
            <option value="ALL">{tr('All movement types', 'Tous les types')}</option>
            {Object.values(TransactionType).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="rounded border-slate-300 text-[#1B8A2A]"
          />
          <span>{tr('My activity only', 'Mon historique uniquement')}</span>
        </label>
      </div>

      {/* Clean Audit Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {tr('No movement records match the selected filters.', 'Aucun mouvement ne correspond aux filtres sélectionnés.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Date & Time', 'Date & Heure')}</th>
                  <th className="py-2.5 px-4">{tr('Operation', 'Opération')}</th>
                  <th className="py-2.5 px-4">{tr('Reagent / Bottle', 'Réactif / Flacon')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Quantity Change', 'Variation')}</th>
                  <th className="py-2.5 px-4">{tr('User', 'Utilisateur')}</th>
                  <th className="py-2.5 px-4">{tr('Reason / Experiment', 'Motif / Expérience')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((tx) => {
                  const prod = productMap.get(tx.productId);
                  return (
                    <tr
                      key={tx.transactionId}
                      onClick={() => onSelectContainer(tx.containerId)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatTimestamp(tx.timestamp)}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <TransactionTypeLabel type={tx.type} />
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono font-semibold text-[#1E3A8A]">
                          {tx.containerId}
                        </span>{' '}
                        <span className="font-medium text-slate-900">
                          {prod?.chemicalName || tx.productId}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            tx.quantityChange < 0
                              ? 'text-amber-700'
                              : tx.quantityChange > 0
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {tx.quantityChange > 0
                            ? `+${tx.quantityChange}`
                            : tx.quantityChange}{' '}
                          {tx.unit}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          {tx.quantityBefore} → {tx.quantityAfter} {tx.unit}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                        {tx.userName}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                        {tx.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
