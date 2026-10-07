import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, QrCode, Search } from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { StatusIndicator } from '../utils/formatters';

interface QRScannerViewProps {
  onScanSuccess: (containerId: string) => void;
}

export const QRScannerView: React.FC<QRScannerViewProps> = ({ onScanSuccess }) => {
  const { containers, products } = useInventoryContext();
  const { tr } = useLanguage();
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = 'chemledger-qr-reader';

  const productMap = React.useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.productId, p.chemicalName));
    return map;
  }, [products]);

  const parseScannedPayload = (decodedText: string): string => {
    const trimmed = decodedText.trim();
    if (trimmed.includes('/container/')) {
      const parts = trimmed.split('/container/');
      return parts[parts.length - 1].split(/[?#]/)[0].trim().toUpperCase();
    }
    return trimmed.toUpperCase();
  };

  const startScanner = async () => {
    setCameraError(null);
    try {
      const html5QrCode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5QrCode;
      setCameraActive(true);

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
        },
        (decodedText) => {
          const targetId = parseScannedPayload(decodedText);
          if (targetId) {
            stopScanner().then(() => {
              onScanSuccess(targetId);
            });
          }
        },
        () => {}
      );
    } catch (err) {
      setCameraActive(false);
      setCameraError(
        err instanceof Error
          ? tr(
              `Camera initialization failed: ${err.message}. You can also enter or select a Container ID below.`,
              `Échec d’initialisation de la caméra : ${err.message}. Vous pouvez également saisir ou sélectionner un ID de flacon ci-dessous.`
            )
          : tr(
              'Unable to access camera hardware in this browser frame.',
              'Impossible d’accéder à la caméra dans ce navigateur.'
            )
      );
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // Ignore cleanup errors
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.trim().toUpperCase();
    if (!cleaned) return;
    onScanSuccess(cleaned);
  };

  return (
    <div className="w-full space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {tr('Mobile Bench QR Scanner', 'Scanner QR de Paillasse Mobile')}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {tr(
            'Scan a physical chemical bottle label using your device camera to launch immediate atomic stock withdrawal or inspection.',
            'Scannez l’étiquette QR d’un flacon chimique avec votre caméra pour lancer un prélèvement ou une inspection immédiate.'
          )}
        </p>
      </div>

      <div className="bg-slate-900 text-white border border-slate-800 rounded-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-cyan-400" />
            <span className="font-mono text-xs uppercase tracking-wider text-slate-300">
              {tr(
                'Optical Barcode & QR Reader (html5-qrcode)',
                'Lecteur Optique Code-Barres & QR (html5-qrcode)'
              )}
            </span>
          </div>
          {!cameraActive ? (
            <button
              onClick={startScanner}
              className="px-4 py-2 text-xs font-semibold bg-cyan-500 text-slate-950 rounded-md hover:bg-cyan-400 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>{tr('Start Camera Scanner', 'Activer la Caméra')}</span>
            </button>
          ) : (
            <button
              onClick={stopScanner}
              className="px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-md hover:bg-rose-500 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <CameraOff className="w-4 h-4" />
              <span>{tr('Stop Camera', 'Arrêter la Caméra')}</span>
            </button>
          )}
        </div>

        <div className="relative bg-slate-950 border border-slate-800 rounded-md overflow-hidden min-h-[280px] flex flex-col items-center justify-center">
          <div id={readerElementId} className="w-full max-w-md" />
          {!cameraActive && (
            <div className="p-8 text-center space-y-3">
              <Camera className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-300 max-w-md">
                {tr(
                  'Click Start Camera Scanner to activate your mobile or webcam lens and center the container’s QR label inside the crosshair.',
                  'Cliquez sur Activer la Caméra pour allumer votre objectif et centrer le code QR du flacon dans le cadre.'
                )}
              </p>
            </div>
          )}
        </div>

        {cameraError && (
          <div className="mt-4 p-3 bg-rose-950/80 border border-rose-800 rounded text-xs text-rose-200">
            {cameraError}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-md p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {tr(
              'Direct Container ID Entry or Quick Bench Selection',
              'Saisie Directe de l’ID du Flacon ou Sélection Rapide'
            )}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {tr(
              'Type a container barcode directly (e.g., SOL-001) or tap an active bottle below to simulate a QR scan.',
              'Saisissez directement le code du flacon (ex. SOL-001) ou cliquez sur un flacon actif ci-dessous.'
            )}
          </p>
        </div>

        <form onSubmit={handleManualLookup} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder={tr(
                'Enter Container ID (e.g. SOL-001, REA-104, ACD-201)...',
                'Entrez l’ID du flacon (ex. SOL-001, REA-104, ACD-201)...'
              )}
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono uppercase border border-slate-300 rounded-md focus:outline-none focus:border-cyan-600"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            {tr('Open Container', 'Ouvrir le Flacon')}
          </button>
        </form>

        {containers.length > 0 && (
          <div className="pt-4 border-t border-slate-200">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
              {tr(
                'Registered Lab Bottles (Tap to Simulate QR Scan)',
                'Flacons du Laboratoire Enregistrés (Cliquer pour Ouvrir)'
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {containers.map((c) => (
                <button
                  key={c.containerId}
                  onClick={() => onScanSuccess(c.containerId)}
                  className="text-left p-3.5 border border-slate-200 rounded-md hover:border-cyan-600 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="min-w-0 pr-3">
                    <div className="font-mono text-sm font-bold text-cyan-700">
                      {c.containerId}
                    </div>
                    <div className="text-xs font-medium text-slate-900 truncate mt-0.5">
                      {productMap.get(c.productId) || c.productId}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {tr('Loc:', 'Empl :')} {c.location.code} · {c.currentQuantity} {c.unit}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusIndicator status={c.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
