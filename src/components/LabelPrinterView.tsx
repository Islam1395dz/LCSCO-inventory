import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckSquare, Printer, Square } from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LCSCOLogo } from './LCSCOLogo';

interface LabelPrinterViewProps {
  initialSelectedIds?: string[];
}

export const LabelPrinterView: React.FC<LabelPrinterViewProps> = ({
  initialSelectedIds,
}) => {
  const { containers, products } = useInventoryContext();
  const { tr } = useLanguage();
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialSelectedIds && initialSelectedIds.length > 0
      ? initialSelectedIds
      : containers.map((c) => c.containerId)
  );

  const productMap = useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const toggleContainer = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(containers.map((c) => c.containerId));
  const clearAll = () => setSelectedIds([]);

  const selectedContainers = containers.filter((c) =>
    selectedIds.includes(c.containerId)
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {tr(
              'LCSCO Thermal QR Code Bottle Labels',
              'Étiquettes QR Thermiques pour Flacons LCSCO'
            )}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {tr(
              'Formatted for LCSCO chemical bottles. Includes official LCSCO badge, Chemical Name, Container ID, Location Code, CAS, and scannable QR code.',
              'Formatées pour les flacons chimiques du LCSCO. Inclut l’emblème officiel LCSCO, le nom chimique, l’ID du flacon, l’emplacement, le CAS et le code QR.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            {tr('Select All', 'Tout Sélectionner')} ({containers.length})
          </button>
          <button
            onClick={clearAll}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            {tr('Clear', 'Effacer')}
          </button>
          <button
            onClick={handlePrint}
            disabled={selectedContainers.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#1B8A2A] rounded-md hover:bg-emerald-800 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>
              {tr(
                `Print ${selectedContainers.length} LCSCO Labels`,
                `Imprimer ${selectedContainers.length} Étiquettes LCSCO`
              )}
            </span>
          </button>
        </div>
      </div>

      <div className="print:hidden bg-white border border-slate-200 rounded-md p-4">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
          {tr(
            'Select Bottles for Print Sheet',
            'Sélectionner les Flacons à Imprimer'
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {containers.map((c) => {
            const isChecked = selectedIds.includes(c.containerId);
            return (
              <button
                key={c.containerId}
                onClick={() => toggleContainer(c.containerId)}
                className={`px-3 py-1.5 text-xs font-mono rounded border flex items-center gap-2 transition-colors cursor-pointer ${
                  isChecked
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {isChecked ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{c.containerId}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-2 print:gap-3">
        {selectedContainers.map((c) => {
          const prod = productMap.get(c.productId);
          const qrPayload = `${window.location.origin}/#/container/${c.containerId}`;

          return (
            <div
              key={c.containerId}
              className="bg-white border-2 border-slate-900 rounded-sm p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 break-inside-avoid min-w-0 overflow-hidden"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-900 pb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <LCSCOLogo size="sm" />
                    <span className="font-mono text-sm font-bold tracking-tight text-slate-900 truncate">
                      {c.containerId}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] font-semibold uppercase text-slate-700 shrink-0">
                    CAS {prod?.casNumber || 'N/A'}
                  </span>
                </div>

                <div className="font-bold text-xs text-slate-900 leading-snug line-clamp-2 break-words">
                  {prod?.chemicalName || c.productId}
                </div>

                <div className="font-mono text-[11px] font-semibold text-slate-900 pt-0.5 truncate">
                  LOC: {c.location.code}
                </div>

                <div className="font-mono text-[10px] text-slate-600 flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-[#1B8A2A]">LCSCO</span>
                  <span>·</span>
                  <span>
                    {c.initialQuantity} {c.unit}
                  </span>
                  <span>·</span>
                  <span>Exp: {c.expiryDate}</span>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-center mx-auto sm:mx-0">
                <QRCodeSVG value={qrPayload} size={84} level="M" />
                <span className="font-mono text-[9px] text-slate-500 mt-1">
                  LCSCO SCAN TX
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
