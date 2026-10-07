import React, { useState } from 'react';
import {
  AlertTriangle,
  ClipboardCheck,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LCSCO_PLACEMENT_ZONES } from '../services/chemicalCompatibilityService';
import {
  ChemicalUnit,
  NotificationPriority,
  PermissionAction,
  StockRuptureStatus,
} from '../types/inventory';
import { formatTimestamp } from '../utils/formatters';
import { parseDisplayError } from '../firebase';
import { Button, PageHeader, StatusBadge } from './DesignSystem';

interface RequestsViewProps {
  onSelectContainer: (containerId: string) => void;
  initialTab?: 'PURCHASES' | 'DISPOSALS' | 'ADJUSTMENTS' | 'RUPTURES';
}

export const RequestsView: React.FC<RequestsViewProps> = ({
  onSelectContainer,
  initialTab = 'PURCHASES',
}) => {
  const {
    profile,
    containers,
    products,
    purchaseRequests,
    disposalRequests,
    adjustmentRequests,
    stockRuptureRequests,
    canPerform,
    createPurchaseRequest,
    approveOrOrderPurchaseRequest,
    receivePurchaseOrderIntoInventory,
    createDisposalRequest,
    approveDisposalRequest,
    recordPhysicalDisposal,
    submitStockAdjustmentRequest,
    approveStockAdjustmentRequest,
    reportStockRupture,
    updateStockRuptureStatus,
    isAdmin,
    isPhdStudent,
  } = useInventoryContext();

  const { tr } = useLanguage();

  const [activeTab, setActiveTab] = useState<
    'PURCHASES' | 'DISPOSALS' | 'ADJUSTMENTS' | 'RUPTURES'
  >(initialTab);
  const [onlyMyRequests, setOnlyMyRequests] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modal states (Progressive disclosure: forms open only when requested)
  const [activeModal, setActiveModal] = useState<
    'PURCHASE' | 'DISPOSAL' | 'ADJUSTMENT' | 'RUPTURE' | null
  >(null);

  // Purchase form state
  const [purChemName, setPurChemName] = useState('');
  const [purCas, setPurCas] = useState('');
  const [purFormula, setPurFormula] = useState('');
  const [purQty, setPurQty] = useState('500');
  const [purUnit, setPurUnit] = useState<ChemicalUnit>(ChemicalUnit.MILLILITER);
  const [purSupplier, setPurSupplier] = useState('Sigma-Aldrich');
  const [purBox, setPurBox] = useState('FLAM-01');
  const [purReason, setPurReason] = useState('');

  // Receive delivery state (Room -> Cabinet -> Side -> Shelf -> Position)
  const [receivingPurchaseId, setReceivingPurchaseId] = useState<string | null>(null);
  const [rcvBottleId, setRcvBottleId] = useState('SOL-105');
  const [rcvLot, setRcvLot] = useState('LOT-2026-88');
  const [rcvExpiry, setRcvExpiry] = useState('2028-12-31');
  const [rcvRoom, setRcvRoom] = useState('204');
  const [rcvBox, setRcvBox] = useState('FLAM-01');
  const [rcvSide, setRcvSide] = useState<'Left' | 'Right'>('Left');
  const [rcvShelf, setRcvShelf] = useState('1');
  const [rcvPosition, setRcvPosition] = useState('01');

  // Disposal form state
  const [dispContainerId, setDispContainerId] = useState(
    containers[0]?.containerId || 'SOL-001'
  );
  const [dispReason, setDispReason] = useState('');

  // Adjustment form state
  const [adjContainerId, setAdjContainerId] = useState(
    containers[0]?.containerId || 'SOL-001'
  );
  const [adjPhysicalQty, setAdjPhysicalQty] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Rupture form state
  const [rupContainerId, setRupContainerId] = useState(
    containers[0]?.containerId || 'SOL-001'
  );
  const [rupPriority, setRupPriority] = useState<NotificationPriority>(
    NotificationPriority.CRITICAL
  );
  const [rupComment, setRupComment] = useState('');

  const productMap = React.useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const filteredPurchases = onlyMyRequests
    ? purchaseRequests.filter((p) => p.requestedByUid === profile?.uid)
    : purchaseRequests;

  const filteredDisposals = onlyMyRequests
    ? disposalRequests.filter((d) => d.requestedByUid === profile?.uid)
    : disposalRequests;

  const filteredAdjustments = onlyMyRequests
    ? adjustmentRequests.filter((a) => a.requestedByUid === profile?.uid)
    : adjustmentRequests;

  const filteredRuptures = onlyMyRequests
    ? stockRuptureRequests.filter((r) => r.reportedByUid === profile?.uid)
    : stockRuptureRequests;

  const handleCreatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      createPurchaseRequest({
        chemicalName: purChemName,
        casNumber: purCas,
        formula: purFormula,
        requestedQuantity: parseFloat(purQty),
        unit: purUnit,
        supplier: purSupplier,
        reason: purReason,
        targetPlacementBox: purBox,
      });
      setPurChemName('');
      setPurCas('');
      setPurFormula('');
      setPurReason('');
      setActiveModal(null);
      setActiveTab('PURCHASES');
      setFeedback({
        type: 'success',
        message: tr('Purchase request created.', 'Demande d’achat créée.'),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleCreateDisposal = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      createDisposalRequest({
        containerId: dispContainerId,
        reason: dispReason,
      });
      setDispReason('');
      setActiveModal(null);
      setActiveTab('DISPOSALS');
      setFeedback({
        type: 'success',
        message: tr('Disposal request created.', 'Demande d’élimination créée.'),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleCreateAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const bottle = containers.find((c) => c.containerId === adjContainerId);
      if (!bottle) return;
      submitStockAdjustmentRequest({
        containerId: adjContainerId,
        measuredQuantity: parseFloat(adjPhysicalQty),
        unit: bottle.unit,
        reason: adjReason,
      });
      setAdjPhysicalQty('');
      setAdjReason('');
      setActiveModal(null);
      setActiveTab('ADJUSTMENTS');
      setFeedback({
        type: 'success',
        message: isAdmin
          ? tr('Stock adjustment applied.', 'Ajustement de stock appliqué.')
          : tr(
              'Adjustment request submitted for approval.',
              'Demande d’ajustement soumise pour approbation.'
            ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleCreateRupture = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const { ruptureRequest } = reportStockRupture({
        containerId: rupContainerId,
        priority: rupPriority,
        comment: rupComment,
      });
      setRupComment('');
      setActiveModal(null);
      setActiveTab('RUPTURES');
      setFeedback({
        type: 'success',
        message: tr(
          `Stock rupture reported (${ruptureRequest.ruptureId}).`,
          `Rupture de stock signalée (${ruptureRequest.ruptureId}).`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleReceiveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPurchaseId) return;
    setFeedback(null);
    try {
      receivePurchaseOrderIntoInventory({
        purchaseId: receivingPurchaseId,
        newContainerId: rcvBottleId,
        lotNumber: rcvLot,
        expiryDate: rcvExpiry,
        placementBox: rcvBox,
        room: rcvRoom,
        side: rcvSide,
        shelf: rcvShelf,
        position: rcvPosition,
      });
      setReceivingPurchaseId(null);
      setFeedback({
        type: 'success',
        message: tr(
          `Delivery validated — bottle ${rcvBottleId.toUpperCase()} added to inventory.`,
          `Livraison réceptionnée — flacon ${rcvBottleId.toUpperCase()} ajouté à l’inventaire.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr('Requests & Approvals', 'Demandes & Approbations')}
        subtitle={tr(
          'Centralized management for purchase orders, chemical disposals, stock adjustments, and stock rupture reports.',
          'Gestion centralisée des demandes d’achat, d’élimination, d’ajustement de stock et des signalements de rupture.'
        )}
        actions={
          <>
            {canPerform(PermissionAction.REPORT_STOCK_RUPTURE) && (
              <Button variant="secondary" onClick={() => setActiveModal('RUPTURE')}>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>{tr('Report Rupture', 'Signaler rupture')}</span>
              </Button>
            )}
            {canPerform(PermissionAction.CREATE_DISPOSAL_REQUEST) && (
              <Button variant="secondary" onClick={() => setActiveModal('DISPOSAL')}>
                <Trash2 className="w-3.5 h-3.5 text-slate-600" />
                <span>{tr('Request Disposal', 'Demander élimination')}</span>
              </Button>
            )}
            {canPerform(PermissionAction.SUBMIT_STOCK_ADJUSTMENT) && (
              <Button variant="secondary" onClick={() => setActiveModal('ADJUSTMENT')}>
                <ClipboardCheck className="w-3.5 h-3.5 text-slate-600" />
                <span>{tr('New Adjustment', 'Nouvel ajustement')}</span>
              </Button>
            )}
            {canPerform(PermissionAction.CREATE_PURCHASE_REQUEST) && (
              <Button variant="primary" onClick={() => setActiveModal('PURCHASE')}>
                <Plus className="w-3.5 h-3.5" />
                <span>{tr('New Purchase Request', 'Nouvelle demande d’achat')}</span>
              </Button>
            )}
          </>
        }
      />

      {feedback && (
        <div
          className={`p-3.5 border rounded-md text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline font-mono ml-4 cursor-pointer"
          >
            {tr('Dismiss', 'Fermer')}
          </button>
        </div>
      )}

      {/* Navigation Tabs + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('PURCHASES')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'PURCHASES'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>{tr('Purchases', 'Achats')}</span>
            <span className="font-mono text-[11px] opacity-80">
              ({filteredPurchases.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DISPOSALS')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'DISPOSALS'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{tr('Disposals', 'Éliminations')}</span>
            <span className="font-mono text-[11px] opacity-80">
              ({filteredDisposals.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ADJUSTMENTS')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'ADJUSTMENTS'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>{tr('Stock Adjustments', 'Ajustements')}</span>
            <span className="font-mono text-[11px] opacity-80">
              ({filteredAdjustments.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RUPTURES')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'RUPTURES'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{tr('Stock Ruptures', 'Ruptures de stock')}</span>
            <span className="font-mono text-[11px] opacity-80">
              ({filteredRuptures.length})
            </span>
          </button>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyMyRequests}
            onChange={(e) => setOnlyMyRequests(e.target.checked)}
            className="rounded border-slate-300 text-[#1B8A2A] focus:ring-[#1B8A2A]"
          />
          <span>
            {isPhdStudent
              ? tr('Show only my requests', 'Afficher uniquement mes demandes')
              : tr('Created by me', 'Créées par moi')}
          </span>
        </label>
      </div>

      {/* Delivery Registration Drawer */}
      {receivingPurchaseId && (
        <form
          onSubmit={handleReceiveOrder}
          className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-md space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-950">
              {tr(
                'Validate Incoming Delivery & Register Bottle in Inventory',
                'Valider la livraison et enregistrer le flacon dans l’inventaire'
              )}
            </span>
            <button
              type="button"
              onClick={() => setReceivingPurchaseId(null)}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                {tr('New Container ID *', 'Nouvel ID Flacon *')}
              </label>
              <input
                type="text"
                required
                value={rcvBottleId}
                onChange={(e) => setRcvBottleId(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                {tr('Lot Number *', 'Numéro de lot *')}
              </label>
              <input
                type="text"
                required
                value={rcvLot}
                onChange={(e) => setRcvLot(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                {tr('Expiry Date *', 'Date d’expiration *')}
              </label>
              <input
                type="date"
                required
                value={rcvExpiry}
                onChange={(e) => setRcvExpiry(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                {tr('Room *', 'Salle *')}
              </label>
              <select
                value={rcvRoom}
                onChange={(e) => setRcvRoom(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded"
              >
                <option value="204">Room 204</option>
                <option value="308">Room 308</option>
                <option value="101">Room 101</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                {tr('Cabinet *', 'Armoire *')}
              </label>
              <select
                value={rcvBox}
                onChange={(e) => setRcvBox(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded"
              >
                {LCSCO_PLACEMENT_ZONES.map((z) => (
                  <option key={z.unit} value={z.unit}>
                    {z.unit} — {z.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                {tr('Side *', 'Côté *')}
              </label>
              <select
                value={rcvSide}
                onChange={(e) => setRcvSide(e.target.value as 'Left' | 'Right')}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
              >
                <option value="Left">{tr('Left side', 'Côté Gauche (Left)')}</option>
                <option value="Right">{tr('Right side', 'Côté Droit (Right)')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                {tr('Shelf *', 'Étagère *')}
              </label>
              <select
                value={rcvShelf}
                onChange={(e) => setRcvShelf(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded"
              >
                <option value="1">Shelf 1</option>
                <option value="2">Shelf 2</option>
                <option value="3">Shelf 3</option>
                <option value="4">Shelf 4</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">
                {tr('Position *', 'Position *')}
              </label>
              <select
                value={rcvPosition}
                onChange={(e) => setRcvPosition(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded"
              >
                <option value="01">Position 01</option>
                <option value="02">Position 02</option>
                <option value="03">Position 03</option>
                <option value="04">Position 04</option>
                <option value="05">Position 05</option>
                <option value="06">Position 06</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => setReceivingPurchaseId(null)}
            >
              {tr('Cancel', 'Annuler')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {tr('Confirm Receipt', 'Confirmer la réception')}
            </Button>
          </div>
        </form>
      )}

      {/* TAB 1: PURCHASES */}
      {activeTab === 'PURCHASES' && (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Chemical', 'Réactif')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Quantity', 'Quantité')}</th>
                  <th className="py-2.5 px-4">{tr('Requester', 'Demandeur')}</th>
                  <th className="py-2.5 px-4">{tr('Justification', 'Justification')}</th>
                  <th className="py-2.5 px-4">{tr('Status', 'Statut')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.map((pur) => (
                  <tr key={pur.purchaseId} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{pur.chemicalName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {pur.supplier} · {pur.targetPlacementBox || 'FLAM-A'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {pur.requestedQuantity} {pur.unit}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      <div>{pur.requestedByName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {formatTimestamp(pur.requestedAt).split(',')[0]}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                      {pur.reason}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={pur.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {pur.status === 'REQUESTED' &&
                          canPerform(PermissionAction.APPROVE_PURCHASE_REQUEST) && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() =>
                                  approveOrOrderPurchaseRequest(pur.purchaseId, 'APPROVED')
                                }
                              >
                                {tr('Approve', 'Approuver')}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  approveOrOrderPurchaseRequest(pur.purchaseId, 'ORDERED')
                                }
                              >
                                {tr('Order', 'Commander')}
                              </Button>
                            </>
                          )}
                        {pur.status === 'APPROVED' &&
                          canPerform(PermissionAction.APPROVE_PURCHASE_REQUEST) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                approveOrOrderPurchaseRequest(pur.purchaseId, 'ORDERED')
                              }
                            >
                              {tr('Mark Ordered', 'Marquer commandé')}
                            </Button>
                          )}
                        {(pur.status === 'APPROVED' || pur.status === 'ORDERED') &&
                          canPerform(PermissionAction.RECEIVE_VALIDATED_DELIVERY) && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                setReceivingPurchaseId(pur.purchaseId);
                                setRcvBox(pur.targetPlacementBox || 'FLAM-01');
                              }}
                            >
                              {tr('Receive Delivery', 'Réceptionner')}
                            </Button>
                          )}
                        {pur.receivedContainerId && (
                          <Button
                            size="sm"
                            variant="tertiary"
                            onClick={() => onSelectContainer(pur.receivedContainerId!)}
                          >
                            {pur.receivedContainerId} →
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DISPOSALS */}
      {activeTab === 'DISPOSALS' && (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Bottle / Chemical', 'Flacon / Réactif')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Quantity', 'Quantité')}</th>
                  <th className="py-2.5 px-4">{tr('Requester', 'Demandeur')}</th>
                  <th className="py-2.5 px-4">{tr('Reason', 'Motif')}</th>
                  <th className="py-2.5 px-4">{tr('Status', 'Statut')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDisposals.map((dsp) => (
                  <tr key={dsp.disposalId} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectContainer(dsp.containerId)}
                        className="font-mono font-semibold text-[#1E3A8A] hover:underline cursor-pointer"
                      >
                        {dsp.containerId}
                      </button>
                      <div className="text-slate-900 font-medium">{dsp.chemicalName}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {dsp.quantity} {dsp.unit}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {dsp.requestedByName}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                      {dsp.reason}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={dsp.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {dsp.status === 'REQUESTED' &&
                          canPerform(PermissionAction.APPROVE_DISPOSAL_REQUEST) && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => approveDisposalRequest(dsp.disposalId, true)}
                              >
                                {tr('Approve', 'Approuver')}
                              </Button>
                              <Button
                                size="sm"
                                variant="tertiary"
                                onClick={() => approveDisposalRequest(dsp.disposalId, false)}
                              >
                                {tr('Reject', 'Rejeter')}
                              </Button>
                            </>
                          )}
                        {dsp.status === 'APPROVED' &&
                          canPerform(PermissionAction.RECORD_APPROVED_DISPOSAL) && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                recordPhysicalDisposal(
                                  dsp.disposalId,
                                  `WASTE-${new Date().getFullYear()}`
                                )
                              }
                            >
                              {tr('Confirm Disposed', 'Confirmer élimination')}
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: STOCK ADJUSTMENTS */}
      {activeTab === 'ADJUSTMENTS' && (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Bottle / Chemical', 'Flacon / Réactif')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Digital → Physical', 'Numérique → Physique')}</th>
                  <th className="py-2.5 px-4">{tr('Requested By', 'Demandeur')}</th>
                  <th className="py-2.5 px-4">{tr('Reason', 'Motif')}</th>
                  <th className="py-2.5 px-4">{tr('Status', 'Statut')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdjustments.map((adj) => (
                  <tr key={adj.requestId} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectContainer(adj.containerId)}
                        className="font-mono font-semibold text-[#1E3A8A] hover:underline cursor-pointer"
                      >
                        {adj.containerId}
                      </button>
                      <div className="text-slate-900 font-medium">{adj.chemicalName}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {adj.previousQuantity} → <strong>{adj.newQuantity}</strong> {adj.unit} (
                      {adj.difference > 0 ? `+${adj.difference}` : adj.difference})
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {adj.requestedByName}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                      {adj.reason}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={adj.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {adj.status === 'PENDING' &&
                        canPerform(PermissionAction.APPROVE_STOCK_ADJUSTMENT) && (
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => approveStockAdjustmentRequest(adj.requestId, true)}
                            >
                              {tr('Approve', 'Approuver')}
                            </Button>
                            <Button
                              size="sm"
                              variant="tertiary"
                              onClick={() => approveStockAdjustmentRequest(adj.requestId, false)}
                            >
                              {tr('Reject', 'Rejeter')}
                            </Button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: STOCK RUPTURES */}
      {activeTab === 'RUPTURES' && (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Bottle / Chemical', 'Flacon / Réactif')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Digital Stock', 'Stock numérique')}</th>
                  <th className="py-2.5 px-4">{tr('Reporter & Comment', 'Déclarant & Note')}</th>
                  <th className="py-2.5 px-4">{tr('Status', 'Statut')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRuptures.map((rup) => (
                  <tr key={rup.ruptureId} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectContainer(rup.containerId)}
                          className="font-mono font-semibold text-[#1E3A8A] hover:underline cursor-pointer"
                        >
                          {rup.containerId}
                        </button>
                        {rup.reportCount > 1 && (
                          <span className="font-mono text-[11px] text-rose-700 font-semibold">
                            (×{rup.reportCount})
                          </span>
                        )}
                      </div>
                      <div className="text-slate-900 font-medium">{rup.chemicalName}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {rup.currentInventoryQuantity} {rup.unit}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                      <span className="font-medium text-slate-800">{rup.reportedByName}:</span>{' '}
                      {rup.comment || tr('Stock rupture', 'Rupture de stock')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={rup.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {canPerform(PermissionAction.REVIEW_STOCK_RUPTURE) &&
                        rup.status !== StockRuptureStatus.RESOLVED &&
                        rup.status !== StockRuptureStatus.REJECTED && (
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {rup.status === StockRuptureStatus.REPORTED && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  updateStockRuptureStatus({
                                    ruptureId: rup.ruptureId,
                                    nextStatus: StockRuptureStatus.UNDER_REVIEW,
                                  })
                                }
                              >
                                {tr('Review', 'Examiner')}
                              </Button>
                            )}
                            {(rup.status === StockRuptureStatus.REPORTED ||
                              rup.status === StockRuptureStatus.UNDER_REVIEW) && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  updateStockRuptureStatus({
                                    ruptureId: rup.ruptureId,
                                    nextStatus: StockRuptureStatus.CONFIRMED,
                                  })
                                }
                              >
                                {tr('Confirm', 'Confirmer')}
                              </Button>
                            )}
                            {rup.status === StockRuptureStatus.CONFIRMED && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() =>
                                  updateStockRuptureStatus({
                                    ruptureId: rup.ruptureId,
                                    nextStatus: StockRuptureStatus.RESOLVED,
                                  })
                                }
                              >
                                {tr('Resolve', 'Résoudre')}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="tertiary"
                              onClick={() =>
                                updateStockRuptureStatus({
                                  ruptureId: rup.ruptureId,
                                  nextStatus: StockRuptureStatus.REJECTED,
                                })
                              }
                            >
                              {tr('Reject', 'Rejeter')}
                            </Button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: NEW PURCHASE REQUEST */}
      {activeModal === 'PURCHASE' && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-md max-w-lg w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {tr('New Purchase Request', 'Nouvelle demande d’achat')}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreatePurchase} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Chemical Name *', 'Nom du réactif *')}
                </label>
                <input
                  type="text"
                  required
                  value={purChemName}
                  onChange={(e) => setPurChemName(e.target.value)}
                  placeholder="e.g. Tetrahydrofuran (Anhydrous)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">CAS</label>
                  <input
                    type="text"
                    value={purCas}
                    onChange={(e) => setPurCas(e.target.value)}
                    placeholder="109-99-9"
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {tr('Supplier', 'Fournisseur')}
                  </label>
                  <input
                    type="text"
                    value={purSupplier}
                    onChange={(e) => setPurSupplier(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {tr('Quantity *', 'Quantité *')}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={purQty}
                    onChange={(e) => setPurQty(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {tr('Unit', 'Unité')}
                  </label>
                  <select
                    value={purUnit}
                    onChange={(e) => setPurUnit(e.target.value as ChemicalUnit)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md bg-white"
                  >
                    {Object.values(ChemicalUnit).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {tr('Cabinet', 'Armoire')}
                  </label>
                  <select
                    value={purBox}
                    onChange={(e) => setPurBox(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md bg-white"
                  >
                    {LCSCO_PLACEMENT_ZONES.map((z) => (
                      <option key={z.unit} value={z.unit}>
                        {z.unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Justification *', 'Justification *')}
                </label>
                <input
                  type="text"
                  required
                  value={purReason}
                  onChange={(e) => setPurReason(e.target.value)}
                  placeholder={tr('Research project or synthesis step', 'Projet de recherche ou synthèse')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setActiveModal(null)}>
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button type="submit" variant="primary">
                  {tr('Submit Request', 'Envoyer la demande')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW DISPOSAL REQUEST */}
      {activeModal === 'DISPOSAL' && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-md max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {tr('Request Chemical Disposal', 'Demande d’élimination')}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateDisposal} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Select Bottle *', 'Sélectionner le flacon *')}
                </label>
                <select
                  value={dispContainerId}
                  onChange={(e) => setDispContainerId(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md bg-white"
                >
                  {containers.map((c) => {
                    const p = productMap.get(c.productId);
                    return (
                      <option key={c.containerId} value={c.containerId}>
                        {c.containerId} — {p?.chemicalName} ({c.currentQuantity} {c.unit})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Disposal Reason *', 'Motif de l’élimination *')}
                </label>
                <input
                  type="text"
                  required
                  value={dispReason}
                  onChange={(e) => setDispReason(e.target.value)}
                  placeholder={tr('Expired, contaminated, or degraded', 'Périmé, contaminé ou dégradé')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setActiveModal(null)}>
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button type="submit" variant="danger">
                  {tr('Submit Disposal Request', 'Soumettre la demande')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW STOCK ADJUSTMENT */}
      {activeModal === 'ADJUSTMENT' && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-md max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {tr('Physical Stock Adjustment', 'Ajustement après inventaire physique')}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAdjustment} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Select Bottle *', 'Sélectionner le flacon *')}
                </label>
                <select
                  value={adjContainerId}
                  onChange={(e) => setAdjContainerId(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md bg-white"
                >
                  {containers.map((c) => {
                    const p = productMap.get(c.productId);
                    return (
                      <option key={c.containerId} value={c.containerId}>
                        {c.containerId} — {p?.chemicalName} ({c.currentQuantity} {c.unit})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Measured Physical Quantity *', 'Quantité physique mesurée *')}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={adjPhysicalQty}
                  onChange={(e) => setAdjPhysicalQty(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Audit Reason *', 'Motif de l’écart *')}
                </label>
                <input
                  type="text"
                  required
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder={tr('e.g. Volatile solvent evaporation', 'ex. Évaporation solvant volatil')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setActiveModal(null)}>
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button type="submit" variant="primary">
                  {tr('Submit Adjustment', 'Envoyer')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REPORT STOCK RUPTURE */}
      {activeModal === 'RUPTURE' && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-md max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {tr('Report Stock Rupture', 'Signaler une rupture de stock')}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateRupture} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Select Bottle *', 'Sélectionner le flacon *')}
                </label>
                <select
                  value={rupContainerId}
                  onChange={(e) => setRupContainerId(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md bg-white"
                >
                  {containers.map((c) => {
                    const p = productMap.get(c.productId);
                    return (
                      <option key={c.containerId} value={c.containerId}>
                        {c.containerId} — {p?.chemicalName} ({c.currentQuantity} {c.unit})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Severity / Priority *', 'Priorité *')}
                </label>
                <select
                  value={rupPriority}
                  onChange={(e) => setRupPriority(e.target.value as NotificationPriority)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md bg-white"
                >
                  <option value={NotificationPriority.CRITICAL}>CRITICAL</option>
                  <option value={NotificationPriority.HIGH}>HIGH</option>
                  <option value={NotificationPriority.MEDIUM}>MEDIUM</option>
                  <option value={NotificationPriority.LOW}>LOW</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Observation / Comment', 'Commentaire')}
                </label>
                <input
                  type="text"
                  value={rupComment}
                  onChange={(e) => setRupComment(e.target.value)}
                  placeholder={tr('e.g. Bottle empty on shelf S2', 'ex. Flacon vide sur étagère S2')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setActiveModal(null)}>
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button type="submit" variant="danger">
                  {tr('Send Alert', 'Envoyer l’alerte')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
