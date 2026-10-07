import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCheck,
  CheckCircle2,
  FlaskConical,
  X,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  AppNotification,
  NotificationPriority,
  NotificationType,
  PermissionAction,
  StockRuptureRequest,
  StockRuptureStatus,
} from '../types/inventory';
import { formatTimestamp } from '../utils/formatters';

interface NotificationCenterProps {
  onSelectContainer: (containerId: string) => void;
  onNavigateDashboard: () => void;
  onNavigateRequests?: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  onSelectContainer,
  onNavigateDashboard,
  onNavigateRequests,
}) => {
  const {
    myNotifications,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    stockRuptureRequests,
    updateStockRuptureStatus,
    canPerform,
  } = useInventoryContext();

  const { tr } = useLanguage();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'UNREAD' | 'ALL'>('UNREAD');
  const [inspectingRupture, setInspectingRupture] = useState<StockRuptureRequest | null>(null);
  const [ruptureNote, setRuptureNote] = useState('');
  const [ruptureFeedback, setRuptureFeedback] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (inspectingRupture) {
      const latest = stockRuptureRequests.find(
        (r) => r.ruptureId === inspectingRupture.ruptureId
      );
      if (latest) {
        setInspectingRupture(latest);
      }
    }
  }, [stockRuptureRequests, inspectingRupture?.ruptureId]);

  const unreadList = useMemo(
    () => myNotifications.filter((n) => !n.isRead),
    [myNotifications]
  );

  const displayedNotifications = useMemo(() => {
    const base = activeTab === 'UNREAD' ? unreadList : myNotifications;
    return base.slice(0, 8);
  }, [activeTab, unreadList, myNotifications]);

  const getPriorityIndicator = (priority: NotificationPriority) => {
    switch (priority) {
      case NotificationPriority.CRITICAL:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-rose-700">
            <span>!</span>
            <span>CRIT</span>
          </span>
        );
      case NotificationPriority.HIGH:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-amber-700">
            <span>▲</span>
            <span>HIGH</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">
            <span>●</span>
            <span>INFO</span>
          </span>
        );
    }
  };

  const handleOpenRelatedItem = (n: AppNotification) => {
    if (!n.isRead) {
      markNotificationAsRead(n.notificationId);
    }
    if (n.type === NotificationType.STOCK_RUPTURE && n.relatedRequestId) {
      const matchedRupture = stockRuptureRequests.find(
        (r) => r.ruptureId === n.relatedRequestId
      );
      if (matchedRupture) {
        setInspectingRupture(matchedRupture);
        setRuptureNote(matchedRupture.resolutionNote || '');
        setRuptureFeedback(null);
        return;
      }
    }
    if (n.relatedContainerId) {
      setIsOpen(false);
      onSelectContainer(n.relatedContainerId);
      return;
    }
    setIsOpen(false);
    if (onNavigateRequests) {
      onNavigateRequests();
    } else {
      onNavigateDashboard();
    }
  };

  const handleRuptureStatusChange = (nextStatus: StockRuptureStatus) => {
    if (!inspectingRupture) return;
    try {
      updateStockRuptureStatus({
        ruptureId: inspectingRupture.ruptureId,
        nextStatus,
        resolutionNote: ruptureNote,
      });
      setRuptureFeedback(tr(`Status updated: ${nextStatus}`, `Statut : ${nextStatus}`));
    } catch (err: any) {
      setRuptureFeedback(err?.message || 'Error');
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Clean Header Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={tr('Notifications', 'Notifications')}
        className="relative px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
      >
        <Bell className="w-3.5 h-3.5 text-slate-600" />
        {unreadNotificationCount > 0 && (
          <span className="font-mono font-semibold tabular-nums text-[11px] text-[#1B8A2A]">
            {unreadNotificationCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed sm:absolute right-2 sm:right-0 mt-1.5 w-[92vw] sm:w-[360px] max-h-[70vh] bg-white border border-slate-200 rounded-md shadow-lg z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('UNREAD')}
                className={`font-medium cursor-pointer ${
                  activeTab === 'UNREAD'
                    ? 'text-slate-900 font-semibold underline underline-offset-4 decoration-[#1B8A2A]'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tr('Unread', 'Non lues')} ({unreadList.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`font-medium cursor-pointer ${
                  activeTab === 'ALL'
                    ? 'text-slate-900 font-semibold underline underline-offset-4 decoration-[#1B8A2A]'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tr('Recent', 'Récentes')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {unreadNotificationCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsAsRead}
                  className="text-[11px] text-[#1B8A2A] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>{tr('Mark all read', 'Tout lire')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Inline Stock Rupture Inspection Sub-View */}
          {inspectingRupture ? (
            <div className="p-4 space-y-3 overflow-y-auto bg-slate-50 flex-1 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="font-mono text-[10px] font-semibold text-rose-700">
                    {inspectingRupture.ruptureId} · {inspectingRupture.status}
                  </span>
                  <h4 className="text-xs font-semibold text-slate-900">
                    {inspectingRupture.chemicalName} ({inspectingRupture.containerId})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectingRupture(null)}
                  className="text-[11px] text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  ← {tr('Back', 'Retour')}
                </button>
              </div>

              {ruptureFeedback && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-900">
                  {ruptureFeedback}
                </div>
              )}

              <div className="p-2.5 bg-white border border-slate-200 rounded space-y-1 text-[11px]">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-500">{tr('Digital Stock:', 'Stock :')}</span>
                  <strong className="text-slate-900">
                    {inspectingRupture.currentInventoryQuantity} {inspectingRupture.unit}
                  </strong>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-slate-500">{tr('Reports:', 'Signalements :')}</span>
                  <strong className="text-slate-900">{inspectingRupture.reportCount}</strong>
                </div>
              </div>

              {canPerform(PermissionAction.REVIEW_STOCK_RUPTURE) && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={ruptureNote}
                    onChange={(e) => setRuptureNote(e.target.value)}
                    placeholder={tr('Inspection note...', 'Note d’inspection...')}
                    className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-slate-300 rounded"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRuptureStatusChange(StockRuptureStatus.UNDER_REVIEW)}
                      className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      {tr('Under Review', 'Examiner')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRuptureStatusChange(StockRuptureStatus.CONFIRMED)}
                      className="px-2 py-1 text-[11px] font-medium bg-rose-600 text-white rounded hover:bg-rose-700 cursor-pointer"
                    >
                      {tr('Confirm', 'Confirmer')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRuptureStatusChange(StockRuptureStatus.RESOLVED)}
                      className="px-2 py-1 text-[11px] font-medium bg-[#1B8A2A] text-white rounded hover:bg-emerald-800 cursor-pointer"
                    >
                      {tr('Resolve', 'Résoudre')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRuptureStatusChange(StockRuptureStatus.REJECTED)}
                      className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      {tr('Reject', 'Rejeter')}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const cid = inspectingRupture.containerId;
                  setInspectingRupture(null);
                  setIsOpen(false);
                  onSelectContainer(cid);
                }}
                className="w-full py-1.5 px-2.5 bg-slate-900 text-white text-[11px] font-medium rounded flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FlaskConical className="w-3 h-3" />
                <span>{tr(`Open ${inspectingRupture.containerId}`, `Ouvrir ${inspectingRupture.containerId}`)}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
              {displayedNotifications.length === 0 ? (
                <div className="p-6 text-center space-y-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />
                  <p className="text-xs text-slate-600">
                    {tr('No unread notifications.', 'Aucune notification non lue.')}
                  </p>
                </div>
              ) : (
                displayedNotifications.map((n) => (
                  <div
                    key={n.notificationId}
                    onClick={() => handleOpenRelatedItem(n)}
                    className={`px-4 py-2.5 transition-colors cursor-pointer ${
                      !n.isRead ? 'bg-slate-50/90 hover:bg-slate-100/70' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {getPriorityIndicator(n.priority)}
                        <h4 className="text-xs font-medium text-slate-900 truncate">
                          {n.title}
                        </h4>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {formatTimestamp(n.createdAt).split(',')[0]}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Footer link to Requests / History */}
          {!inspectingRupture && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">
                {myNotifications.length} {tr('total notifications', 'notifications au total')}
              </span>
              {onNavigateRequests && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onNavigateRequests();
                  }}
                  className="font-medium text-[#1B8A2A] hover:underline cursor-pointer"
                >
                  {tr('View Requests →', 'Voir les demandes →')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
