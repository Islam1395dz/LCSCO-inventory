import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useLanguage } from '../context/LanguageContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { language } = useLanguage();
  const isFr = language === 'fr';

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg border border-amber-500">
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
      <span>
        {isFr
          ? 'Mode Hors-Ligne — Données d’inventaire et scanner QR disponibles via le cache local.'
          : 'Offline Mode — Inventory data & QR scanner remain available from local cache.'}
      </span>
    </div>
  );
};
