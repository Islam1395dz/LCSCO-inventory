import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FlaskConical,
  MapPin,
  Minus,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  QrCode,
  Scale,
  ShieldAlert,
  Sliders,
  Trash2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useInventoryContext } from '../context/AuthContext';
import {
  addChemicalStock,
  deleteChemicalContainer,
  flagContainerIssue,
  resolveFlaggedContainer,
  transferContainerLocation,
  withdrawChemicalStock,
} from '../services/inventoryService';
import {
  buildStorageLocation,
  calculateAdditionMutation,
  calculateWithdrawalMutation,
  formatPhysicalLocationCode,
} from '../services/inventoryDomain';
import { parseDisplayError } from '../firebase';
import {
  CHEMICAL_CLASSIFICATIONS,
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  NotificationPriority,
  PermissionAction,
  STOCK_ADJUSTMENT_REASONS,
  StockAdjustmentReasonType,
  STORAGE_CLASSIFICATIONS,
  TransactionType,
} from '../types/inventory';
import {
  extractPhysicalLocationFields,
  formatRoleLabel,
  formatTimestamp,
  TransactionTypeLabel,
} from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { evaluateChemicalPlacementCompatibility } from '../services/chemicalCompatibilityService';
import {
  Badge,
  Button,
  ContainerStatusBadge,
  Modal,
  PageHeader,
} from './DesignSystem';

interface ContainerDetailViewProps {
  containerId: string;
  onBack: () => void;
  onSelectContainer?: (containerId: string) => void;
}

export const ContainerDetailView: React.FC<ContainerDetailViewProps> = ({
  containerId,
  onBack,
  onSelectContainer,
}) => {
  const {
    containers,
    products,
    transactions,
    profile,
    isAdmin,
    isAdminOrProf,
    isTechnician,
    isActiveLabMember,
    isPreviewMode,
    updatePreviewState,
    canPerform,
    submitStockAdjustmentRequest,
    adjustContainerQuantityDirectly,
    createDisposalRequest,
    createPurchaseRequest,
    reportStockRupture,
    stockRuptureRequests,
    physicalLocations,
    updateContainerAndProduct,
    renameShelfInCabinet,
    savePhysicalLocation,
  } = useInventoryContext();
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const container = useMemo(
    () => containers.find((c) => c.containerId === containerId) || null,
    [containers, containerId]
  );

  const product = useMemo(
    () => (container ? products.find((p) => p.productId === container.productId) || null : null),
    [container, products]
  );

  const containerTransactions = useMemo(
    () => transactions.filter((t) => t.containerId === containerId),
    [transactions, containerId]
  );

  const activeRuptureForContainer = useMemo(
    () =>
      stockRuptureRequests.find(
        (r) =>
          (r.containerId === containerId ||
            (container && r.productId === container.productId)) &&
          r.status !== 'RESOLVED' &&
          r.status !== 'REJECTED'
      ) || null,
    [stockRuptureRequests, containerId, container]
  );

  // Sub-navigation tabs inside Reagent Detail Page
  const [detailTab, setDetailTab] = useState<'overview' | 'location' | 'history' | 'safety'>(
    'overview'
  );

  // Secondary Actions Dropdown
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  // Modals
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showAdjustQtyModal, setShowAdjustQtyModal] = useState(false);
  const [showAdjustConfirmStep, setShowAdjustConfirmStep] = useState(false);
  const [showProfessorAdjustModal, setShowProfessorAdjustModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showRuptureModal, setShowRuptureModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);

  // Feedback state
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Form states
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');

  const [addAmount, setAddAmount] = useState('');
  const [addReason, setAddReason] = useState('');

  // Controlled Quantity Adjustment (Director & Lab Engineer)
  const [adjNewQuantity, setAdjNewQuantity] = useState('');
  const [adjReasonType, setAdjReasonType] = useState<StockAdjustmentReasonType>(
    'Physical inventory count'
  );
  const [adjComment, setAdjComment] = useState('');

  // Professor Stock Adjustment Request
  const [measuredQty, setMeasuredQty] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  // Physical Location Transfer State (Room -> Cabinet -> Side -> Shelf -> Position)
  const [newRoom, setNewRoom] = useState('');
  const [newCabinet, setNewCabinet] = useState('');
  const [newSide, setNewSide] = useState<'Left' | 'Right'>('Left');
  const [newShelf, setNewShelf] = useState('1');
  const [newPosition, setNewPosition] = useState('01');
  const [transferReason, setTransferReason] = useState('');

  const [rupturePriority, setRupturePriority] = useState<NotificationPriority>(
    NotificationPriority.CRITICAL
  );
  const [ruptureComment, setRuptureComment] = useState('');

  const [purchaseQty, setPurchaseQty] = useState('1000');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [purchaseReason, setPurchaseReason] = useState('');

  const [disposalReason, setDisposalReason] = useState('');

  const [flagTarget, setFlagTarget] = useState<
    ContainerStatus.NEEDS_IDENTIFICATION | ContainerStatus.QUARANTINED
  >(ContainerStatus.NEEDS_IDENTIFICATION);
  const [flagReason, setFlagReason] = useState('');

  const [resolutionChoice, setResolutionChoice] = useState<'RESTORE' | 'DISPOSAL'>('RESTORE');
  const [resolutionReason, setResolutionReason] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Full Reagent / Solvent / Salt Edit Modal State (Director & Lab Engineer)
  const [showFullEditModal, setShowFullEditModal] = useState(false);
  const [editContainerIdVal, setEditContainerIdVal] = useState('');
  const [editChemName, setEditChemName] = useState('');
  const [editCasNumber, setEditCasNumber] = useState('');
  const [editFormula, setEditFormula] = useState('');
  const [editMolWeight, setEditMolWeight] = useState('');
  const [editChemClass, setEditChemClass] = useState('Solvents');
  const [editStorageClass, setEditStorageClass] = useState('Flammable solvent');
  const [editInitialQty, setEditInitialQty] = useState('');
  const [editCurrentQty, setEditCurrentQty] = useState('');
  const [editUnit, setEditUnit] = useState<ChemicalUnit>(ChemicalUnit.MILLILITER);
  const [editMinStock, setEditMinStock] = useState('');
  const [editReorderLevel, setEditReorderLevel] = useState('');
  const [editLotNumber, setEditLotNumber] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editRoom, setEditRoom] = useState('204');
  const [editCabinet, setEditCabinet] = useState('A');
  const [editSide, setEditSide] = useState<'Left' | 'Right'>('Left');
  const [editShelf, setEditShelf] = useState('1');
  const [editPosition, setEditPosition] = useState('01');
  const [editStatus, setEditStatus] = useState<ContainerStatus>(ContainerStatus.NORMAL);
  const [editSdsUrl, setEditSdsUrl] = useState('');

  // Available Rooms, Cabinets, Sides, Shelves, Positions from physicalLocations
  const availableRooms = useMemo(() => {
    const rooms = Array.from(new Set(physicalLocations.map((p) => p.room)));
    return rooms.length > 0 ? rooms : ['204', '308', '101'];
  }, [physicalLocations]);

  const cabinetsForSelectedRoom = useMemo(() => {
    const matching = physicalLocations.filter((p) => p.room === newRoom);
    return matching.length > 0 ? matching : physicalLocations;
  }, [physicalLocations, newRoom]);

  const selectedCabinetConfig = useMemo(() => {
    return (
      physicalLocations.find((p) => p.room === newRoom && p.cabinet === newCabinet) ||
      physicalLocations.find((p) => p.cabinet === newCabinet) ||
      physicalLocations[0]
    );
  }, [physicalLocations, newRoom, newCabinet]);

  const transferCompatibilityReport = useMemo(() => {
    if (!container || !newCabinet.trim()) return null;
    return evaluateChemicalPlacementCompatibility({
      candidateProduct: product,
      candidateStorageCondition: container.storageCondition,
      targetUnitCode: newCabinet.trim(),
      targetShelfCode: newShelf.trim(),
      allContainers: containers,
      allProducts: products,
      excludeContainerId: container.containerId,
    });
  }, [container, product, newCabinet, newShelf, containers, products]);

  // Same-cabinet / same-side / same-shelf neighbors
  const currentLocDetails = useMemo(
    () => (container ? extractPhysicalLocationFields(container.location) : null),
    [container]
  );

  const neighborContainers = useMemo(() => {
    if (!container || !currentLocDetails) return [];
    return containers.filter(
      (c) =>
        c.containerId !== container.containerId &&
        c.location.room === currentLocDetails.room &&
        c.location.unit === currentLocDetails.cabinet
    );
  }, [containers, container, currentLocDetails]);

  if (!container) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-600 mb-4">
          {isFr ? `Contenant "${containerId}" introuvable.` : `Container "${containerId}" not found.`}
        </p>
        <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>
          {isFr ? 'Retour aux réactifs' : 'Back to Reagents'}
        </Button>
      </div>
    );
  }

  const ratio =
    container.initialQuantity > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((container.currentQuantity / container.initialQuantity) * 100))
        )
      : 0;

  const isLocked =
    container.status === ContainerStatus.NEEDS_IDENTIFICATION ||
    container.status === ContainerStatus.QUARANTINED ||
    container.status === ContainerStatus.DISPOSAL_REQUIRED ||
    container.status === ContainerStatus.EXPIRED;

  const canDirectlyAdjustQuantity = isAdmin || isTechnician;
  const canEditEverything =
    isAdmin || isTechnician || canPerform(PermissionAction.EDIT_CHEMICAL_INFO);
  const locFields = extractPhysicalLocationFields(container.location);

  const openFullEditForCurrent = () => {
    setEditContainerIdVal(container.containerId);
    setEditChemName(product?.chemicalName || container.productId);
    setEditCasNumber(product?.casNumber || '');
    setEditFormula(product?.formula || '');
    setEditMolWeight(String(product?.molecularWeight || 0));
    setEditChemClass(
      container.chemicalClassification || product?.chemicalClassification || 'Solvents'
    );
    setEditStorageClass(
      container.storageClassification || product?.storageClassification || 'Flammable solvent'
    );
    setEditInitialQty(String(container.initialQuantity));
    setEditCurrentQty(String(container.currentQuantity));
    setEditUnit(container.unit);
    setEditMinStock(String(product?.minimumStock || 0));
    setEditReorderLevel(String(product?.reorderLevel || 0));
    setEditLotNumber(container.lotNumber);
    setEditSupplier(container.supplier);
    setEditExpiryDate(container.expiryDate);
    setEditRoom(locFields.room);
    setEditCabinet(locFields.cabinet);
    setEditSide(locFields.side);
    setEditShelf(locFields.shelf);
    setEditPosition(locFields.position);
    setEditStatus(container.status);
    setEditSdsUrl(product?.sdsUrl || 'https://pubchem.ncbi.nlm.nih.gov');
    setShowFullEditModal(true);
  };

  const handleSaveFullEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditEverything) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const matchedCab =
        physicalLocations.find((p) => p.room === editRoom && p.cabinet === editCabinet) ||
        physicalLocations.find((p) => p.cabinet === editCabinet);

      const nextId = editContainerIdVal.trim().toUpperCase();
      updateContainerAndProduct({
        containerId: container.containerId,
        newContainerId: nextId,
        chemicalName: editChemName,
        casNumber: editCasNumber,
        formula: editFormula,
        molecularWeight: parseFloat(editMolWeight) || 0,
        chemicalClassification: editChemClass,
        storageClassification: editStorageClass,
        hazardClass: product?.hazardClass || ['GHS07 Irritant'],
        minimumStock: parseFloat(editMinStock) || 0,
        reorderLevel: parseFloat(editReorderLevel) || 0,
        sdsUrl: editSdsUrl,
        initialQuantity: parseFloat(editInitialQty) || 0,
        currentQuantity: parseFloat(editCurrentQty) || 0,
        unit: editUnit,
        lotNumber: editLotNumber,
        supplier: editSupplier,
        expiryDate: editExpiryDate,
        room: editRoom,
        cabinet: editCabinet,
        cabinetLabel: matchedCab?.cabinetLabel,
        side: editSide,
        shelf: editShelf,
        position: editPosition,
        status: editStatus,
      });

      setShowFullEditModal(false);
      setFeedback({
        type: 'success',
        message: isFr
          ? `Toutes les informations du réactif ont été mises à jour (${editChemName}).`
          : `All reagent details have been updated (${editChemName}).`,
      });
      if (nextId !== container.containerId && onSelectContainer) {
        onSelectContainer(nextId);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const actor = profile
    ? { uid: profile.uid, fullName: profile.fullName, role: profile.role }
    : null;

  // Handlers
  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !isActiveLabMember) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const amount = parseFloat(withdrawAmount);
      if (isPreviewMode) {
        const calc = calculateWithdrawalMutation(
          container,
          amount,
          container.unit,
          withdrawReason
        );
        const txId = `WD-${Date.now().toString(36).toUpperCase()}`;
        updatePreviewState({
          containers: containers.map((c) =>
            c.containerId === container.containerId
              ? {
                  ...c,
                  currentQuantity: calc.quantityAfter,
                  status: calc.newStatus,
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
          transactions: [
            {
              transactionId: txId,
              type: TransactionType.WITHDRAWAL,
              timestamp: new Date().toISOString(),
              userId: actor.uid,
              userName: actor.fullName,
              userRole: actor.role,
              laboratoryId: container.laboratoryId,
              containerId: container.containerId,
              productId: container.productId,
              quantityChange: calc.quantityChange,
              quantityBefore: calc.quantityBefore,
              quantityAfter: calc.quantityAfter,
              unit: container.unit,
              oldLocation: container.location.code,
              newLocation: container.location.code,
              oldStatus: calc.oldStatus,
              newStatus: calc.newStatus,
              reason: withdrawReason.trim(),
            },
            ...transactions,
          ],
        });
        setFeedback({
          type: 'success',
          message: isFr
            ? `Consommation enregistrée : -${amount} ${container.unit}. Stock restant : ${calc.quantityAfter} ${container.unit}.`
            : `Consumption recorded: -${amount} ${container.unit}. Remaining: ${calc.quantityAfter} ${container.unit}.`,
        });
      } else {
        const res = await withdrawChemicalStock({
          containerId: container.containerId,
          amount,
          unit: container.unit,
          reason: withdrawReason,
          actor,
        });
        setFeedback({
          type: 'success',
          message: `Consumption recorded: -${amount} ${container.unit}. Remaining: ${res.newQuantity} ${container.unit}.`,
        });
      }
      setWithdrawAmount('');
      setWithdrawReason('');
      setShowWithdrawModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !canPerform(PermissionAction.RECORD_STOCK_ADDITION)) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const amount = parseFloat(addAmount);
      if (isPreviewMode) {
        const calc = calculateAdditionMutation(container, amount, container.unit, addReason);
        const txId = `ADD-${Date.now().toString(36).toUpperCase()}`;
        updatePreviewState({
          containers: containers.map((c) =>
            c.containerId === container.containerId
              ? {
                  ...c,
                  currentQuantity: calc.quantityAfter,
                  status: calc.newStatus,
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
          transactions: [
            {
              transactionId: txId,
              type: TransactionType.ADDITION,
              timestamp: new Date().toISOString(),
              userId: actor.uid,
              userName: actor.fullName,
              userRole: actor.role,
              laboratoryId: container.laboratoryId,
              containerId: container.containerId,
              productId: container.productId,
              quantityChange: calc.quantityChange,
              quantityBefore: calc.quantityBefore,
              quantityAfter: calc.quantityAfter,
              unit: container.unit,
              oldLocation: container.location.code,
              newLocation: container.location.code,
              oldStatus: calc.oldStatus,
              newStatus: calc.newStatus,
              reason: addReason.trim(),
            },
            ...transactions,
          ],
        });
        setFeedback({
          type: 'success',
          message: isFr
            ? `Entrée de stock enregistrée : +${amount} ${container.unit}.`
            : `Stock addition recorded: +${amount} ${container.unit}.`,
        });
      } else {
        await addChemicalStock({
          containerId: container.containerId,
          amount,
          unit: container.unit,
          reason: addReason,
          actor,
        });
        setFeedback({
          type: 'success',
          message: `Stock addition recorded: +${amount} ${container.unit}.`,
        });
      }
      setAddAmount('');
      setAddReason('');
      setShowAddStockModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1 of Controlled Quantity Adjustment (Director & Lab Engineer): Validate and open confirmation dialog
  const handleProceedToAdjustConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(adjNewQuantity);
    if (isNaN(parsed) || parsed < 0) {
      setFeedback({
        type: 'error',
        message: isFr
          ? 'Veuillez saisir une nouvelle quantité valide (>= 0).'
          : 'Please enter a valid non-negative quantity.',
      });
      return;
    }
    setShowAdjustConfirmStep(true);
  };

  // Step 2 of Controlled Quantity Adjustment: Apply after explicit confirmation
  const handleConfirmDirectQuantityAdjustment = () => {
    if (!canDirectlyAdjustQuantity) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const newQty = parseFloat(adjNewQuantity);
      const prevQty = container.currentQuantity;
      const diff = Math.round((newQty - prevQty) * 10000) / 10000;
      adjustContainerQuantityDirectly({
        containerId: container.containerId,
        newQuantity: newQty,
        adjustmentType: adjReasonType,
        comment: adjComment,
      });
      setFeedback({
        type: 'success',
        message: isFr
          ? `Quantité ajustée et confirmée : ${prevQty} ${container.unit} → ${newQty} ${container.unit} (${diff >= 0 ? '+' : ''}${diff} ${container.unit}). Mouvement enregistré dans l'historique.`
          : `Quantity adjusted and confirmed: ${prevQty} ${container.unit} → ${newQty} ${container.unit} (${diff >= 0 ? '+' : ''}${diff} ${container.unit}). Logged in audit history.`,
      });
      setShowAdjustConfirmStep(false);
      setShowAdjustQtyModal(false);
      setAdjComment('');
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleProfessorSubmitCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !canPerform(PermissionAction.SUBMIT_STOCK_ADJUSTMENT)) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const measured = parseFloat(measuredQty);
      submitStockAdjustmentRequest({
        containerId: container.containerId,
        measuredQuantity: measured,
        unit: container.unit,
        reason: correctionReason,
      });
      setFeedback({
        type: 'success',
        message: isFr
          ? 'Demande d’ajustement soumise au Directeur pour approbation.'
          : 'Stock adjustment request submitted to the Director for approval.',
      });
      setMeasuredQty('');
      setCorrectionReason('');
      setShowProfessorAdjustModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const openTransferModalWithCurrent = () => {
    setNewRoom(locFields.room);
    setNewCabinet(locFields.cabinet);
    setNewSide(locFields.side);
    setNewShelf(locFields.shelf);
    setNewPosition(locFields.position);
    setTransferReason('');
    setShowTransferModal(true);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !canPerform(PermissionAction.MOVE_BETWEEN_LOCATIONS)) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const matchedCab = physicalLocations.find(
        (p) => p.room === newRoom && p.cabinet === newCabinet
      );
      const validatedLocation = buildStorageLocation({
        building: container.location.building || 'LCSCO',
        room: newRoom,
        unit: newCabinet,
        cabinetLabel: matchedCab?.cabinetLabel || locFields.cabinetLabel,
        side: newSide,
        shelf: newShelf,
        position: newPosition,
      });

      if (isPreviewMode) {
        const txId = `TRF-${Date.now().toString(36).toUpperCase()}`;
        updatePreviewState({
          containers: containers.map((c) =>
            c.containerId === container.containerId
              ? {
                  ...c,
                  location: validatedLocation,
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
          transactions: [
            {
              transactionId: txId,
              type: TransactionType.TRANSFER,
              timestamp: new Date().toISOString(),
              userId: actor.uid,
              userName: actor.fullName,
              userRole: actor.role,
              laboratoryId: container.laboratoryId,
              containerId: container.containerId,
              productId: container.productId,
              quantityChange: 0,
              quantityBefore: container.currentQuantity,
              quantityAfter: container.currentQuantity,
              unit: container.unit,
              oldLocation: container.location.code,
              newLocation: validatedLocation.code,
              oldStatus: container.status,
              newStatus: container.status,
              reason: transferReason.trim(),
            },
            ...transactions,
          ],
        });
        setFeedback({
          type: 'success',
          message: isFr
            ? `Emplacement mis à jour : Salle ${validatedLocation.room} → ${validatedLocation.unit} → ${validatedLocation.side === 'Right' ? 'Côté Droit' : 'Côté Gauche'} → Étagère ${validatedLocation.shelf} → Position ${validatedLocation.position} (${validatedLocation.code}).`
            : `Physical location updated: Room ${validatedLocation.room} → ${validatedLocation.unit} → ${validatedLocation.side} side → Shelf ${validatedLocation.shelf} → Position ${validatedLocation.position} (${validatedLocation.code}).`,
        });
      } else {
        const res = await transferContainerLocation({
          containerId: container.containerId,
          newLocationInput: {
            building: container.location.building || 'LCSCO',
            room: newRoom,
            unit: newCabinet,
            side: newSide,
            shelf: newShelf,
            position: newPosition,
          },
          reason: transferReason,
          actor,
        });
        setFeedback({
          type: 'success',
          message: `Container relocated to ${res.newLocationCode}.`,
        });
      }
      setTransferReason('');
      setShowTransferModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportRupture = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = reportStockRupture({
        containerId: container.containerId,
        priority: rupturePriority,
        comment: ruptureComment,
      });
      setFeedback({
        type: 'success',
        message: res.wasMergedDuplicate
          ? isFr
            ? `Signalement fusionné avec l'alerte active (${res.ruptureRequest.ruptureId}).`
            : `Merged with active stock rupture report (${res.ruptureRequest.ruptureId}).`
          : isFr
          ? `Rupture de stock signalée (${res.ruptureRequest.ruptureId}). Directeur et Ingénieur de Laboratoire notifiés.`
          : `Stock rupture reported (${res.ruptureRequest.ruptureId}). Director and Lab Engineer notified.`,
      });
      setRuptureComment('');
      setShowRuptureModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      createPurchaseRequest({
        chemicalName: product?.chemicalName || container.productId,
        casNumber: product?.casNumber || 'N/A',
        formula: product?.formula || 'N/A',
        requestedQuantity: parseFloat(purchaseQty) || 1000,
        unit: container.unit,
        supplier: purchaseSupplier || container.supplier || 'Sigma-Aldrich',
        reason: purchaseReason,
        targetPlacementBox: container.location.unit,
      });
      setFeedback({
        type: 'success',
        message: isFr
          ? 'Demande d’achat créée et envoyée pour approbation.'
          : 'Purchase request created and sent for approval.',
      });
      setPurchaseReason('');
      setShowPurchaseModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestDisposal = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      createDisposalRequest({
        containerId: container.containerId,
        reason: disposalReason,
      });
      setFeedback({
        type: 'success',
        message: isFr
          ? 'Demande d’élimination enregistrée. Le flacon est placé en quarantaine.'
          : 'Disposal request submitted. Container placed in quarantine.',
      });
      setDisposalReason('');
      setShowDisposalModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFlagIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !isActiveLabMember) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      if (isPreviewMode) {
        const txId = `FLG-${Date.now().toString(36).toUpperCase()}`;
        updatePreviewState({
          containers: containers.map((c) =>
            c.containerId === container.containerId
              ? { ...c, status: flagTarget, updatedAt: new Date().toISOString() }
              : c
          ),
          transactions: [
            {
              transactionId: txId,
              type: TransactionType.STATUS_CHANGE,
              timestamp: new Date().toISOString(),
              userId: actor.uid,
              userName: actor.fullName,
              userRole: actor.role,
              laboratoryId: container.laboratoryId,
              containerId: container.containerId,
              productId: container.productId,
              quantityChange: 0,
              quantityBefore: container.currentQuantity,
              quantityAfter: container.currentQuantity,
              unit: container.unit,
              oldLocation: container.location.code,
              newLocation: container.location.code,
              oldStatus: container.status,
              newStatus: flagTarget,
              reason: flagReason.trim(),
            },
            ...transactions,
          ],
        });
      } else {
        await flagContainerIssue({
          containerId: container.containerId,
          targetStatus: flagTarget,
          reason: flagReason,
          actor,
        });
      }
      setFeedback({
        type: 'success',
        message: isFr ? 'Problème signalé avec succès.' : 'Container issue flagged.',
      });
      setFlagReason('');
      setShowFlagModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !isAdminOrProf) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await resolveFlaggedContainer({
        containerId: container.containerId,
        resolution: resolutionChoice,
        reason: resolutionReason,
        actor,
      });
      setResolutionReason('');
      setFeedback({
        type: 'success',
        message: isFr ? 'Statut résolu.' : 'Container status resolved.',
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteContainer = async () => {
    if (!actor || !canPerform(PermissionAction.ARCHIVE_REMOVE_CHEMICAL)) return;
    setSubmitting(true);
    try {
      if (isPreviewMode) {
        updatePreviewState({
          containers: containers.filter((c) => c.containerId !== container.containerId),
        });
      } else {
        await deleteChemicalContainer({
          containerId: container.containerId,
          actor,
        });
      }
      onBack();
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
      setSubmitting(false);
    }
  };

  const parsedNewQty = parseFloat(adjNewQuantity);
  const computedAdjDiff =
    !isNaN(parsedNewQty)
      ? Math.round((parsedNewQty - container.currentQuantity) * 10000) / 10000
      : 0;

  const previewLocationCode = formatPhysicalLocationCode({
    room: newRoom || locFields.room,
    unit: newCabinet || locFields.cabinet,
    side: newSide,
    shelf: newShelf || '1',
    position: newPosition || '01',
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Back */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isFr ? 'Retour aux réactifs' : 'Back to Reagents'}</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <span>{locFields.cabinet}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span>Level {locFields.shelf}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span>{locFields.side} side</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-semibold">{container.containerId}</span>
        </div>
      </div>

      {/* Header with Primary & Secondary Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <PageHeader
          title={product?.chemicalName || container.productId}
          subtitle={`${isFr ? 'Flacon' : 'Container'} ${container.containerId} · CAS ${
            product?.casNumber || '—'
          } · ${product?.formula || '—'}`}
          badge={<ContainerStatusBadge status={container.status} isFr={isFr} />}
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Primary Action: Record Consumption */}
              {canPerform(PermissionAction.RECORD_CONSUMPTION) && (
                <Button
                  variant="primary"
                  icon={<Minus className="w-4 h-4" />}
                  disabled={isLocked}
                  onClick={() => setShowWithdrawModal(true)}
                >
                  {isFr ? 'Enregistrer consommation' : 'Record consumption'}
                </Button>
              )}

              {/* Controlled Quantity Adjustment Button for Director & Lab Engineer */}
              {canDirectlyAdjustQuantity && (
                <Button
                  variant="secondary"
                  icon={<Sliders className="w-4 h-4 text-teal-700" />}
                  onClick={() => {
                    setAdjNewQuantity(String(container.currentQuantity));
                    setAdjReasonType('Physical inventory count');
                    setAdjComment('');
                    setShowAdjustConfirmStep(false);
                    setShowAdjustQtyModal(true);
                  }}
                >
                  {isFr ? 'Ajuster la quantité' : 'Adjust quantity'}
                </Button>
              )}

              {/* Full Edit Everything Button for Director & Lab Engineer */}
              {canEditEverything && (
                <Button
                  variant="secondary"
                  icon={<Pencil className="w-4 h-4 text-teal-700" />}
                  onClick={openFullEditForCurrent}
                >
                  {isFr ? 'Modifier la fiche' : 'Edit reagent'}
                </Button>
              )}

              {/* Secondary Action: Move Location */}
              {canPerform(PermissionAction.MOVE_BETWEEN_LOCATIONS) && (
                <Button
                  variant="secondary"
                  icon={<MapPin className="w-4 h-4" />}
                  onClick={openTransferModalWithCurrent}
                >
                  {isFr ? 'Modifier emplacement' : 'Change location'}
                </Button>
              )}

              {/* Secondary Action: Request Purchase */}
              {canPerform(PermissionAction.CREATE_PURCHASE_REQUEST) && (
                <Button
                  variant="secondary"
                  icon={<Package className="w-4 h-4" />}
                  onClick={() => {
                    setPurchaseSupplier(container.supplier || 'Sigma-Aldrich');
                    setShowPurchaseModal(true);
                  }}
                >
                  {isFr ? 'Commander' : 'Request purchase'}
                </Button>
              )}

              {/* Progressive Disclosure Menu for Secondary / Contextual Actions */}
              <div className="relative">
                <Button
                  variant="secondary"
                  icon={<MoreVertical className="w-4 h-4" />}
                  onClick={() => setShowActionsMenu((prev) => !prev)}
                >
                  {isFr ? 'Plus d’actions' : 'More actions'}
                </Button>

                {showActionsMenu && (
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowActionsMenu(false)}
                  />
                )}

                {showActionsMenu && (
                  <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40 text-sm">
                    {canPerform(PermissionAction.RECORD_STOCK_ADDITION) && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false);
                          setShowAddStockModal(true);
                        }}
                        className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                      >
                        <Plus className="w-4 h-4 text-emerald-600" />
                        <span>{isFr ? 'Ajouter du stock (+)' : 'Add stock (+)'}</span>
                      </button>
                    )}

                    {canDirectlyAdjustQuantity && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false);
                          setAdjNewQuantity(String(container.currentQuantity));
                          setAdjReasonType('Physical inventory count');
                          setAdjComment('');
                          setShowAdjustConfirmStep(false);
                          setShowAdjustQtyModal(true);
                        }}
                        className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                      >
                        <Sliders className="w-4 h-4 text-teal-600" />
                        <span>{isFr ? 'Ajuster la quantité' : 'Adjust quantity'}</span>
                      </button>
                    )}

                    {!canDirectlyAdjustQuantity &&
                      canPerform(PermissionAction.SUBMIT_STOCK_ADJUSTMENT) && (
                        <button
                          onClick={() => {
                            setShowActionsMenu(false);
                            setMeasuredQty(String(container.currentQuantity));
                            setShowProfessorAdjustModal(true);
                          }}
                          className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                        >
                          <Scale className="w-4 h-4 text-blue-600" />
                          <span>
                            {isFr ? 'Demander ajustement stock' : 'Request stock adjustment'}
                          </span>
                        </button>
                      )}

                    {canPerform(PermissionAction.REPORT_STOCK_RUPTURE) && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false);
                          setShowRuptureModal(true);
                        }}
                        className="w-full px-4 py-2 text-left text-rose-700 hover:bg-rose-50 flex items-center gap-2.5 font-medium"
                      >
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>{isFr ? 'Signaler rupture' : 'Report stock rupture'}</span>
                      </button>
                    )}

                    {canPerform(PermissionAction.CREATE_DISPOSAL_REQUEST) && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false);
                          setShowDisposalModal(true);
                        }}
                        className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                      >
                        <Trash2 className="w-4 h-4 text-slate-500" />
                        <span>{isFr ? 'Demander élimination' : 'Request disposal'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setShowFlagModal(true);
                      }}
                      className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                    >
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      <span>{isFr ? 'Signaler anomalie flacon' : 'Flag container issue'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setShowQrModal(true);
                      }}
                      className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                    >
                      <QrCode className="w-4 h-4 text-slate-500" />
                      <span>{isFr ? 'Étiquette QR Code' : 'View QR Code label'}</span>
                    </button>

                    {canPerform(PermissionAction.ARCHIVE_REMOVE_CHEMICAL) && (
                      <div className="border-t border-slate-100 mt-1 pt-1">
                        <button
                          onClick={() => {
                            setShowActionsMenu(false);
                            setConfirmDeleteOpen(true);
                          }}
                          className="w-full px-4 py-2 text-left text-rose-700 hover:bg-rose-50 flex items-center gap-2.5"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>{isFr ? 'Supprimer définitivement' : 'Delete record'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          }
        />

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`mt-4 px-4 py-3 rounded-lg border flex items-center justify-between text-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs font-medium underline ml-4"
            >
              {isFr ? 'Fermer' : 'Dismiss'}
            </button>
          </div>
        )}

        {/* Active Stock Rupture Warning Banner */}
        {activeRuptureForContainer && (
          <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-sm text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>
                  {isFr ? 'Signalement de rupture actif' : 'Active Stock Rupture Report'} (
                  {activeRuptureForContainer.ruptureId})
                </strong>{' '}
                — {isFr ? 'Statut :' : 'Status:'} {activeRuptureForContainer.status}
              </span>
            </div>
            <Badge variant="danger">{activeRuptureForContainer.priority}</Badge>
          </div>
        )}

        {/* Key Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-6 pt-6 border-t border-slate-100">
          <div>
            <div className="text-xs font-medium text-slate-500">
              {isFr ? 'Quantité disponible' : 'Current Quantity'}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 font-mono">
                {container.currentQuantity} {container.unit}
              </span>
              <span className="text-xs text-slate-500">
                / {container.initialQuantity} {container.unit} ({ratio}%)
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full ${
                  ratio <= 10
                    ? 'bg-rose-600'
                    : ratio <= 25
                    ? 'bg-amber-500'
                    : 'bg-teal-600'
                }`}
                style={{ width: `${ratio}%` }}
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">
              {isFr ? 'Emplacement physique' : 'Physical Location'}
            </div>
            <div className="mt-1 text-sm font-mono font-bold text-slate-900">
              {locFields.code}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {locFields.cabinetLabel}
            </div>
            <div className="text-[11px] text-teal-700 font-mono font-medium mt-0.5">
              Position {locFields.position}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">
              {isFr ? 'Classification' : 'Classification'}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {container.chemicalClassification ||
                product?.chemicalClassification ||
                'Solvents'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {container.storageClassification ||
                product?.storageClassification ||
                container.storageCondition}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">
              {isFr ? 'Fournisseur & Expiration' : 'Supplier & Expiry'}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {container.supplier}
            </div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">
              Lot {container.lotNumber} · Exp: {container.expiryDate}
            </div>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 mt-6 -mb-6">
          {(
            [
              { id: 'overview', label: isFr ? 'Informations générales' : 'General Information' },
              {
                id: 'location',
                label: isFr ? 'Emplacement physique' : 'Physical Location',
              },
              {
                id: 'history',
                label: `${isFr ? 'Historique' : 'History'} (${containerTransactions.length})`,
              },
              { id: 'safety', label: isFr ? 'Sécurité & FDS' : 'Safety & SDS' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setDetailTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                detailTab === tab.id
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: General Information + Clear Physical Location Card */}
      {detailTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isFr ? 'Spécifications du réactif' : 'Reagent Specifications'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isFr
                  ? 'Données chimiques, seuils de stock et traçabilité du lot.'
                  : 'Chemical properties, stock thresholds, and batch traceability.'}
              </p>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div className="py-2 border-b border-slate-100">
                <dt className="text-xs text-slate-500">
                  {isFr ? 'Nom chimique' : 'Chemical Name'}
                </dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {product?.chemicalName || container.productId}
                </dd>
              </div>
              <div className="py-2 border-b border-slate-100">
                <dt className="text-xs text-slate-500">
                  {isFr ? 'Numéro CAS' : 'CAS Number'}
                </dt>
                <dd className="font-mono font-medium text-slate-900 mt-0.5">
                  {product?.casNumber || '—'}
                </dd>
              </div>
              <div className="py-2 border-b border-slate-100">
                <dt className="text-xs text-slate-500">
                  {isFr ? 'Classification chimique' : 'Chemical Classification'}
                </dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {container.chemicalClassification ||
                    product?.chemicalClassification ||
                    'Solvents'}
                </dd>
              </div>
              <div className="py-2 border-b border-slate-100">
                <dt className="text-xs text-slate-500">
                  {isFr ? 'Classification de stockage' : 'Storage Classification'}
                </dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {container.storageClassification ||
                    product?.storageClassification ||
                    container.storageCondition}
                </dd>
              </div>
              <div className="py-2 border-b border-slate-100">
                <dt className="text-xs text-slate-500">
                  {isFr ? 'Formule & Masse molaire' : 'Formula & Molecular Weight'}
                </dt>
                <dd className="font-mono font-medium text-slate-900 mt-0.5">
                  {product?.formula || '—'} ({product?.molecularWeight || 0} g/mol)
                </dd>
              </div>
              <div className="py-2 border-b border-slate-100">
                <dt className="text-xs text-slate-500">
                  {isFr ? 'Seuil minimum / Réapprovisionnement' : 'Minimum Stock / Reorder Level'}
                </dt>
                <dd className="font-mono font-medium text-slate-900 mt-0.5">
                  Min: {product?.minimumStock || 0} {container.unit} · Reorder:{' '}
                  {product?.reorderLevel || 0} {container.unit}
                </dd>
              </div>
              <div className="py-2 border-b border-slate-100">
                <dt className="text-xs text-slate-500">
                  {isFr ? 'Numéro de lot' : 'Lot / Batch Number'}
                </dt>
                <dd className="font-mono font-medium text-slate-900 mt-0.5">
                  {container.lotNumber}
                </dd>
              </div>
              <div className="py-2 border-b border-slate-100">
                <dt className="text-xs text-slate-500">
                  {isFr ? 'Date d’expiration' : 'Expiry Date'}
                </dt>
                <dd className="font-mono font-medium text-slate-900 mt-0.5">
                  {container.expiryDate}
                </dd>
              </div>
            </dl>

            {/* Flagged Container Resolution Box for Director / Professor */}
            {(container.status === ContainerStatus.NEEDS_IDENTIFICATION ||
              container.status === ContainerStatus.QUARANTINED) &&
              isAdminOrProf && (
                <form
                  onSubmit={handleResolveIssue}
                  className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3"
                >
                  <div className="text-sm font-semibold text-amber-950">
                    {isFr
                      ? 'Résolution Superviseur (Flacon verrouillé)'
                      : 'Supervisor Resolution (Container Locked)'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={resolutionChoice}
                      onChange={(e) =>
                        setResolutionChoice(e.target.value as 'RESTORE' | 'DISPOSAL')
                      }
                      className="px-3 py-2 text-sm bg-white border border-amber-300 rounded-lg"
                    >
                      <option value="RESTORE">
                        {isFr ? 'Restaurer en stock actif' : 'Restore to Active Stock'}
                      </option>
                      <option value="DISPOSAL">
                        {isFr ? 'Marquer pour élimination' : 'Mark for Disposal'}
                      </option>
                    </select>
                    <input
                      type="text"
                      required
                      value={resolutionReason}
                      onChange={(e) => setResolutionReason(e.target.value)}
                      placeholder={
                        isFr ? 'Note de vérification...' : 'Verification note...'
                      }
                      className="px-3 py-2 text-sm bg-white border border-amber-300 rounded-lg"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" variant="primary" size="sm" disabled={submitting}>
                      {isFr ? 'Valider la résolution' : 'Apply resolution'}
                    </Button>
                  </div>
                </form>
              )}
          </div>

          {/* Right Column: Clear Physical Location Display (CAB X- Level Y- Left/Right side) */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-900">
                  {isFr ? 'Emplacement physique' : 'Physical location'}
                </h2>
                <Badge variant="teal">{locFields.code}</Badge>
              </div>

              {/* Exact requested clean physical location block */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{isFr ? 'Armoire' : 'Cabinet'}</span>
                  <span className="font-semibold text-slate-900 text-right">
                    {locFields.cabinet} — {locFields.cabinetLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-slate-200/70 pt-2">
                  <span className="text-slate-500">{isFr ? 'Niveau' : 'Level'}</span>
                  <span className="font-semibold text-slate-900">
                    Level {locFields.shelf}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-slate-200/70 pt-2">
                  <span className="text-slate-500">{isFr ? 'Côté' : 'Side'}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      locFields.side === 'Left'
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-indigo-100 text-indigo-800'
                    }`}
                  >
                    {locFields.side === 'Left'
                      ? isFr
                        ? 'Côté Gauche (Left side)'
                        : 'Left side'
                      : isFr
                      ? 'Côté Droit (Right side)'
                      : 'Right side'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-slate-200/70 pt-2">
                  <span className="text-slate-500">{isFr ? 'Position' : 'Position'}</span>
                  <span className="font-semibold text-slate-900 font-mono">
                    Position {locFields.position}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-slate-200 pt-2.5 text-slate-500">
                  <span>{isFr ? 'Code emplacement' : 'Location code'}</span>
                  <span className="font-mono font-semibold text-teal-800">{locFields.code}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDetailTab('location')}
                >
                  {isFr ? 'Voir l’armoire' : 'View Cabinet Levels'}
                </Button>
                {canPerform(PermissionAction.MOVE_BETWEEN_LOCATIONS) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<MapPin className="w-3.5 h-3.5" />}
                    onClick={openTransferModalWithCurrent}
                  >
                    {isFr ? 'Déplacer' : 'Change location'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Physical Location View (Left & Right Sides Separate) */}
      {detailTab === 'location' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isFr
                  ? `Armoire ${locFields.cabinet} — ${locFields.cabinetLabel}`
                  : `${locFields.cabinet} — ${locFields.cabinetLabel}`}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isFr
                  ? 'Les côtés Gauche (Left side) et Droit (Right side) sont des emplacements physiques distincts.'
                  : 'Left side and Right side are separate physical compartments inside the cabinet.'}
              </p>
            </div>
            {canPerform(PermissionAction.MOVE_BETWEEN_LOCATIONS) && (
              <Button
                variant="secondary"
                size="sm"
                icon={<MapPin className="w-4 h-4" />}
                onClick={openTransferModalWithCurrent}
              >
                {isFr ? 'Modifier l’emplacement' : 'Change location'}
              </Button>
            )}
          </div>

          {/* Visual Left vs Right Cabinet Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['Left', 'Right'] as const).map((sideOption) => {
              const isCurrentSide = locFields.side === sideOption;
              const shelvesToRender =
                physicalLocations.find((p) => p.cabinet === locFields.cabinet)?.shelves || [
                  '1',
                  '2',
                  '3',
                  '4',
                  '5',
                ];
              return (
                <div
                  key={sideOption}
                  className={`rounded-xl border-2 p-4 space-y-3 ${
                    isCurrentSide
                      ? 'border-teal-600 bg-teal-50/20'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isCurrentSide ? 'bg-teal-600' : 'bg-slate-400'
                        }`}
                      />
                      <span className="text-sm font-semibold text-slate-900">
                        {locFields.cabinet} — {sideOption} side
                      </span>
                    </div>
                    {isCurrentSide && (
                      <Badge variant="teal">
                        {isFr ? 'Côté actif' : 'Current Side'}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {shelvesToRender.map((sh) => {
                      const isTargetShelf = isCurrentSide && locFields.shelf === sh;
                      const itemsOnThisSideShelf = containers.filter((c) => {
                        const f = extractPhysicalLocationFields(c.location);
                        return (
                          f.cabinet === locFields.cabinet &&
                          f.side === sideOption &&
                          f.shelf === sh
                        );
                      });

                      return (
                        <div
                          key={sh}
                          className={`p-3 rounded-lg border transition-colors ${
                            isTargetShelf
                              ? 'border-teal-600 bg-white shadow-xs'
                              : 'border-slate-200 bg-white/80'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono font-semibold text-slate-700">
                              {locFields.cabinet}- Level {sh}- {sideOption} side
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {itemsOnThisSideShelf.length}{' '}
                              {isFr ? 'flacon(s)' : 'item(s)'}
                            </span>
                          </div>

                          {itemsOnThisSideShelf.length === 0 ? (
                            <div className="text-[11px] text-slate-400 italic">
                              {isFr ? 'Étagère libre' : 'Empty shelf'}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {itemsOnThisSideShelf.map((item) => {
                                const itemProd = products.find(
                                  (p) => p.productId === item.productId
                                );
                                const itemLoc = extractPhysicalLocationFields(item.location);
                                const isActiveBottle =
                                  item.containerId === container.containerId;
                                return (
                                  <button
                                    key={item.containerId}
                                    type="button"
                                    onClick={() =>
                                      !isActiveBottle &&
                                      onSelectContainer &&
                                      onSelectContainer(item.containerId)
                                    }
                                    className={`text-left p-2 rounded-lg border transition-all ${
                                      isActiveBottle
                                        ? 'border-teal-700 bg-teal-50/70 ring-2 ring-teal-600/20'
                                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-mono text-xs font-bold text-slate-900">
                                        Pos {itemLoc.position} · {item.containerId}
                                      </span>
                                      {isActiveBottle && (
                                        <Badge variant="teal">
                                          {isFr ? 'Ici' : 'Here'}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-700 truncate mt-0.5">
                                      {itemProd?.chemicalName || item.productId}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                      {item.currentQuantity} {item.unit} · {itemLoc.code}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Tab 3: Movement History */}
      {detailTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isFr
                  ? 'Historique des mouvements et ajustements'
                  : 'Stock Movements & Quantity Adjustment History'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isFr
                  ? 'Journal d’audit complet (quantité précédente, nouvelle quantité, différence, motif, utilisateur).'
                  : 'Complete audit log (previous quantity, new quantity, difference, reason, user, and timestamp).'}
              </p>
            </div>
            <Badge variant="neutral">
              {containerTransactions.length} {isFr ? 'entrées' : 'entries'}
            </Badge>
          </div>

          {containerTransactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {isFr
                ? 'Aucun mouvement enregistré pour ce flacon.'
                : 'No movements recorded for this container yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">{isFr ? 'Date & Heure' : 'Date & Time'}</th>
                    <th className="py-3 px-4">{isFr ? 'Type' : 'Type'}</th>
                    <th className="py-3 px-4">{isFr ? 'Utilisateur' : 'User'}</th>
                    <th className="py-3 px-4 text-right">
                      {isFr ? 'Avant → Après (Diff)' : 'Previous → New (Diff)'}
                    </th>
                    <th className="py-3 px-4">{isFr ? 'Motif / Justification' : 'Reason'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {containerTransactions.map((tx) => (
                    <tr key={tx.transactionId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {formatTimestamp(tx.timestamp)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <TransactionTypeLabel type={tx.type} />
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium whitespace-nowrap">
                        {tx.userName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs whitespace-nowrap">
                        <span className="text-slate-500">
                          {tx.quantityBefore} → {tx.quantityAfter} {tx.unit}
                        </span>{' '}
                        <span
                          className={`font-semibold ml-1 ${
                            tx.quantityChange < 0
                              ? 'text-amber-700'
                              : tx.quantityChange > 0
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }`}
                        >
                          ({tx.quantityChange > 0 ? `+${tx.quantityChange}` : tx.quantityChange}{' '}
                          {tx.unit})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs max-w-md">
                        {tx.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Safety & SDS */}
      {detailTab === 'safety' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isFr
                  ? 'Sécurité chimique et Fiche de Données de Sécurité (FDS)'
                  : 'Chemical Safety & Safety Data Sheet (SDS)'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isFr
                  ? 'Classification SGH/CLP et exigences de confinement.'
                  : 'GHS hazard classifications and storage requirements.'}
              </p>
            </div>
            {product?.sdsUrl && (
              <a
                href={product.sdsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>{isFr ? 'Ouvrir la FDS (PubChem)' : 'Open Official SDS'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs font-medium text-slate-500 mb-2">
                {isFr ? 'Classes de danger SGH' : 'GHS Hazard Classes'}
              </div>
              {product?.hazardClass && product.hazardClass.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {product.hazardClass.map((h) => (
                    <Badge key={h} variant="warning">
                      {h}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-slate-500">
                  {isFr ? 'Aucun danger SGH spécifié' : 'No GHS hazards listed'}
                </span>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs font-medium text-slate-500 mb-1">
                {isFr ? 'Exigences de stockage' : 'Storage Requirements'}
              </div>
              <div className="text-sm font-medium text-slate-900">
                {product?.storageRequirements || container.storageCondition}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Record Consumption */}
      <Modal
        open={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        title={isFr ? 'Enregistrer une consommation' : 'Record Chemical Consumption'}
        subtitle={`${product?.chemicalName || container.productId} (${container.containerId}) — ${
          isFr ? 'Disponible :' : 'Available:'
        } ${container.currentQuantity} ${container.unit}`}
      >
        <form onSubmit={handleWithdrawal} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr
                ? `Quantité prélevée (${container.unit})`
                : `Quantity used (${container.unit})`}
            </label>
            <input
              type="number"
              step="any"
              min="0.0001"
              max={container.currentQuantity}
              required
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder={`e.g. 50`}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Référence expérience / Motif' : 'Experiment Reference / Reason'}
            </label>
            <input
              type="text"
              required
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
              placeholder={
                isFr ? 'ex. Synthèse catalytique #EXP-204' : 'e.g. Catalytic synthesis #EXP-204'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowWithdrawModal(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Confirmer le prélèvement' : 'Confirm consumption'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Controlled Quantity Adjustment (Director & Lab Engineer) with 2-Step Confirmation Dialog */}
      <Modal
        open={showAdjustQtyModal}
        onClose={() => {
          setShowAdjustConfirmStep(false);
          setShowAdjustQtyModal(false);
        }}
        title={
          showAdjustConfirmStep
            ? isFr
              ? 'Confirmer l’ajustement de quantité'
              : 'Confirm Quantity Adjustment'
            : isFr
            ? 'Ajuster la quantité du réactif'
            : 'Adjust Reagent Quantity'
        }
        subtitle={
          showAdjustConfirmStep
            ? isFr
              ? 'Veuillez vérifier attentivement les valeurs avant d’appliquer la modification.'
              : 'Please review the quantity change carefully before applying.'
            : `${product?.chemicalName || container.productId} (${container.containerId})`
        }
      >
        {!showAdjustConfirmStep ? (
          <form onSubmit={handleProceedToAdjustConfirm} className="space-y-4">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                {isFr ? 'Quantité actuelle :' : 'Current quantity:'}
              </span>
              <span className="font-mono text-sm font-bold text-slate-900">
                {container.currentQuantity} {container.unit}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr
                  ? `Nouvelle quantité (${container.unit}) *`
                  : `New quantity (${container.unit}) *`}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={adjNewQuantity}
                onChange={(e) => setAdjNewQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Motif de l’ajustement *' : 'Adjustment reason *'}
              </label>
              <select
                value={adjReasonType}
                onChange={(e) => setAdjReasonType(e.target.value as StockAdjustmentReasonType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-teal-600"
              >
                {STOCK_ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Commentaire additionnel (optionnel)' : 'Additional comment (optional)'}
              </label>
              <input
                type="text"
                value={adjComment}
                onChange={(e) => setAdjComment(e.target.value)}
                placeholder={
                  isFr
                    ? 'ex. Pesée de contrôle sur balance Mettler...'
                    : 'e.g. Verified on analytical balance #MT-04...'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAdjustQtyModal(false)}
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </Button>
              <Button type="submit" variant="primary">
                {isFr ? 'Continuer vers confirmation' : 'Review & Confirm'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">{isFr ? 'Réactif :' : 'Reagent:'}</span>
                <span className="font-semibold text-slate-900">
                  {product?.chemicalName || container.productId} ({container.containerId})
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-amber-200/60 pt-2">
                <span className="text-slate-600">
                  {isFr ? 'Quantité précédente :' : 'Previous quantity:'}
                </span>
                <span className="font-mono font-semibold text-slate-800">
                  {container.currentQuantity} {container.unit}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-amber-200/60 pt-2">
                <span className="text-slate-600">
                  {isFr ? 'Nouvelle quantité :' : 'New quantity:'}
                </span>
                <span className="font-mono font-bold text-teal-800">
                  {parsedNewQty} {container.unit}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-amber-200/60 pt-2">
                <span className="text-slate-600">{isFr ? 'Différence :' : 'Difference:'}</span>
                <span
                  className={`font-mono font-bold ${
                    computedAdjDiff < 0
                      ? 'text-rose-700'
                      : computedAdjDiff > 0
                      ? 'text-emerald-700'
                      : 'text-slate-700'
                  }`}
                >
                  {computedAdjDiff > 0 ? `+${computedAdjDiff}` : computedAdjDiff}{' '}
                  {container.unit}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-amber-200/60 pt-2">
                <span className="text-slate-600">{isFr ? 'Motif :' : 'Reason:'}</span>
                <span className="font-medium text-slate-900">
                  {adjReasonType}
                  {adjComment.trim() ? ` — ${adjComment.trim()}` : ''}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAdjustConfirmStep(false)}
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={submitting}
                onClick={handleConfirmDirectQuantityAdjustment}
              >
                {isFr ? 'Confirmer l’ajustement' : 'Confirm adjustment'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 3: Add Stock */}
      <Modal
        open={showAddStockModal}
        onClose={() => setShowAddStockModal(false)}
        title={isFr ? 'Ajouter du stock' : 'Record Stock Addition'}
        subtitle={`${product?.chemicalName || container.productId} (${container.containerId})`}
      >
        <form onSubmit={handleAddition} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? `Quantité ajoutée (${container.unit})` : `Quantity added (${container.unit})`}
            </label>
            <input
              type="number"
              step="any"
              min="0.0001"
              required
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Motif / Bon de livraison' : 'Reason / Delivery Note'}
            </label>
            <input
              type="text"
              required
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              placeholder={isFr ? 'ex. Réception commande' : 'e.g. Delivery replenishment'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddStockModal(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Enregistrer' : 'Save addition'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Professor Stock Adjustment Request */}
      <Modal
        open={showProfessorAdjustModal}
        onClose={() => setShowProfessorAdjustModal(false)}
        title={isFr ? 'Demander un ajustement de stock' : 'Request Stock Adjustment'}
        subtitle={`${product?.chemicalName || container.productId} — ${
          isFr ? 'Actuel :' : 'Current:'
        } ${container.currentQuantity} ${container.unit}`}
      >
        <form onSubmit={handleProfessorSubmitCorrection} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr
                ? `Quantité physique mesurée (${container.unit})`
                : `Measured physical quantity (${container.unit})`}
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={measuredQty}
              onChange={(e) => setMeasuredQty(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Justification de l’écart' : 'Discrepancy Justification'}
            </label>
            <input
              type="text"
              required
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder={
                isFr
                  ? 'ex. Pesée physique sur balance #MT-04'
                  : 'e.g. Physical count on balance #MT-04'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowProfessorAdjustModal(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Soumettre au Directeur' : 'Submit to Director'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 5: Change Physical Location (CAB X- Level Y- Left/Right side) */}
      <Modal
        open={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title={isFr ? 'Modifier l’emplacement physique' : 'Change Physical Location'}
        subtitle={
          isFr
            ? 'Sélectionnez Armoire (CAB 1..4) → Niveau (Level) → Côté (Left/Right side) → Position'
            : 'Select Cabinet (CAB 1..4) → Level → Side (Left/Right side) → Position'
        }
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? '1. Armoire (Cabinet)' : '1. Cabinet'}
            </label>
            <select
              value={newCabinet}
              onChange={(e) => setNewCabinet(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {physicalLocations.map((c) => (
                <option key={c.id} value={c.cabinet}>
                  {c.cabinet} — {c.cabinetLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? '2. Niveau (Level)' : '2. Level'}
              </label>
              <select
                value={newShelf}
                onChange={(e) => setNewShelf(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                {(selectedCabinetConfig?.shelves || ['1', '2', '3', '4', '5']).map((sh) => (
                  <option key={sh} value={sh}>
                    Level {sh}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? '3. Côté (Side)' : '3. Side'}
              </label>
              <select
                value={newSide}
                onChange={(e) => setNewSide(e.target.value as 'Left' | 'Right')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
              >
                <option value="Left">{isFr ? 'Gauche (Left side)' : 'Left side'}</option>
                <option value="Right">{isFr ? 'Droit (Right side)' : 'Right side'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? '4. Position' : '4. Position'}
              </label>
              <select
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                {(
                  selectedCabinetConfig?.positions || ['01', '02', '03', '04', '05', '06']
                ).map((pos) => (
                  <option key={pos} value={pos}>
                    Position {pos}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Generated Location Preview */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-600">
              <div className="font-semibold text-slate-900">
                {newCabinet}- Level {newShelf}- {newSide} side · Position {newPosition}
              </div>
              <div className="text-slate-500 mt-0.5">
                {selectedCabinetConfig?.cabinetLabel}
              </div>
            </div>
            <Badge variant="teal">{previewLocationCode}</Badge>
          </div>

          {transferCompatibilityReport && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                transferCompatibilityReport.overallSeverity === 'DANGER'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : transferCompatibilityReport.overallSeverity === 'WARNING'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="font-semibold">{transferCompatibilityReport.boxFitMessage}</div>
              {transferCompatibilityReport.alerts.map((a) => (
                <div key={a.id} className="mt-1">
                  • {a.title}: {a.message}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Motif du déplacement' : 'Reason for location change'}
            </label>
            <input
              type="text"
              required
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder={
                isFr ? 'ex. Réorganisation armoire solvants' : 'e.g. Cabinet reorganization'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowTransferModal(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Enregistrer l’emplacement' : 'Save new location'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 6: Report Stock Rupture */}
      <Modal
        open={showRuptureModal}
        onClose={() => setShowRuptureModal(false)}
        title={isFr ? 'Signaler une rupture de stock' : 'Report Stock Rupture'}
        subtitle={product?.chemicalName || container.productId}
      >
        <form onSubmit={handleReportRupture} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Niveau d’urgence' : 'Urgency Level'}
            </label>
            <select
              value={rupturePriority}
              onChange={(e) => setRupturePriority(e.target.value as NotificationPriority)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value={NotificationPriority.CRITICAL}>
                {isFr ? 'CRITIQUE — Rupture bloquante' : 'CRITICAL — Urgent stockout'}
              </option>
              <option value={NotificationPriority.HIGH}>
                {isFr ? 'HAUTE — Quantité insuffisante' : 'HIGH — Insufficient stock'}
              </option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Observation' : 'Observation'}
            </label>
            <textarea
              rows={3}
              value={ruptureComment}
              onChange={(e) => setRuptureComment(e.target.value)}
              placeholder={
                isFr
                  ? 'Précisez l’état constaté dans l’armoire...'
                  : 'Describe what you observed in the cabinet...'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowRuptureModal(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {isFr ? 'Envoyer l’alerte' : 'Submit rupture alert'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 7: Request Purchase */}
      <Modal
        open={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        title={isFr ? 'Nouvelle demande d’achat' : 'Request Chemical Purchase'}
        subtitle={product?.chemicalName || container.productId}
      >
        <form onSubmit={handleRequestPurchase} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? `Quantité (${container.unit})` : `Quantity (${container.unit})`}
              </label>
              <input
                type="number"
                min="1"
                required
                value={purchaseQty}
                onChange={(e) => setPurchaseQty(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Fournisseur' : 'Supplier'}
              </label>
              <input
                type="text"
                required
                value={purchaseSupplier}
                onChange={(e) => setPurchaseSupplier(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Justification scientifique' : 'Justification'}
            </label>
            <input
              type="text"
              required
              value={purchaseReason}
              onChange={(e) => setPurchaseReason(e.target.value)}
              placeholder={
                isFr ? 'ex. Requis pour synthèse...' : 'e.g. Required for upcoming synthesis...'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPurchaseModal(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Envoyer la demande' : 'Submit request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 8: Request Disposal */}
      <Modal
        open={showDisposalModal}
        onClose={() => setShowDisposalModal(false)}
        title={isFr ? 'Demander l’élimination du flacon' : 'Request Chemical Disposal'}
        subtitle={`${product?.chemicalName || container.productId} (${container.containerId})`}
      >
        <form onSubmit={handleRequestDisposal} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Motif d’élimination' : 'Reason for disposal'}
            </label>
            <input
              type="text"
              required
              value={disposalReason}
              onChange={(e) => setDisposalReason(e.target.value)}
              placeholder={
                isFr ? 'ex. Produit périmé ou dégradé' : 'e.g. Expired or contaminated reagent'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDisposalModal(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {isFr ? 'Demander l’élimination' : 'Submit disposal request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 9: Flag Anomaly */}
      <Modal
        open={showFlagModal}
        onClose={() => setShowFlagModal(false)}
        title={isFr ? 'Signaler une anomalie sur ce flacon' : 'Flag Container Issue'}
        subtitle={container.containerId}
      >
        <form onSubmit={handleFlagIssue} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Type d’anomalie' : 'Issue Type'}
            </label>
            <select
              value={flagTarget}
              onChange={(e) =>
                setFlagTarget(
                  e.target.value as
                    | ContainerStatus.NEEDS_IDENTIFICATION
                    | ContainerStatus.QUARANTINED
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value={ContainerStatus.NEEDS_IDENTIFICATION}>
                {isFr ? 'Étiquette illisible / À vérifier' : 'Illegible Label / Needs ID'}
              </option>
              <option value={ContainerStatus.QUARANTINED}>
                {isFr ? 'Contamination / Quarantaine' : 'Suspected Contamination / Quarantine'}
              </option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Description' : 'Description'}
            </label>
            <input
              type="text"
              required
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowFlagModal(false)}>
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {isFr ? 'Verrouiller et signaler' : 'Flag container'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 10: QR Label */}
      <Modal
        open={showQrModal}
        onClose={() => setShowQrModal(false)}
        title={isFr ? 'Étiquette QR Code' : 'Container QR Code Label'}
        subtitle={`${container.containerId} · ${locFields.code}`}
        maxWidth="max-w-sm"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl">
            <QRCodeSVG value={container.containerId} size={160} level="M" includeMargin={false} />
          </div>
          <div>
            <div className="font-mono text-base font-bold text-slate-900">
              {container.containerId}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {product?.chemicalName || container.productId}
            </div>
            <div className="text-xs font-medium text-slate-800 mt-1">
              {locFields.cabinetLabel} · Pos {locFields.position}
            </div>
            <div className="text-xs font-mono text-teal-700 mt-0.5">{locFields.code}</div>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => window.print()}>
            {isFr ? 'Imprimer l’étiquette' : 'Print Label'}
          </Button>
        </div>
      </Modal>

      {/* MODAL 11: Confirm Delete */}
      <Modal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={isFr ? 'Supprimer définitivement ce flacon ?' : 'Permanently Delete Container?'}
        subtitle={container.containerId}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {isFr
              ? 'Cette action supprimera définitivement l’enregistrement du flacon de l’inventaire.'
              : 'This action will permanently remove this container record from the inventory.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeleteOpen(false)}>
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button variant="danger" onClick={handleDeleteContainer} disabled={submitting}>
              {isFr ? 'Confirmer la suppression' : 'Delete permanently'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 12: Full Edit Reagent / Solvent / Salt (Director & Lab Engineer) */}
      <Modal
        open={showFullEditModal}
        onClose={() => setShowFullEditModal(false)}
        title={
          isFr
            ? 'Modifier toutes les informations du réactif'
            : 'Edit All Reagent / Solvent / Salt Details'
        }
        subtitle={`${product?.chemicalName || container.productId} (${container.containerId})`}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveFullEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Nom du produit chimique *' : 'Chemical Name *'}
              </label>
              <input
                type="text"
                required
                value={editChemName}
                onChange={(e) => setEditChemName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'ID du flacon *' : 'Container ID *'}
              </label>
              <input
                type="text"
                required
                value={editContainerIdVal}
                onChange={(e) => setEditContainerIdVal(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Numéro CAS' : 'CAS Number'}
              </label>
              <input
                type="text"
                value={editCasNumber}
                onChange={(e) => setEditCasNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Formule' : 'Formula'}
              </label>
              <input
                type="text"
                value={editFormula}
                onChange={(e) => setEditFormula(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Masse molaire (g/mol)' : 'Molecular Weight'}
              </label>
              <input
                type="number"
                step="any"
                value={editMolWeight}
                onChange={(e) => setEditMolWeight(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Classification chimique' : 'Chemical Classification'}
              </label>
              <select
                value={editChemClass}
                onChange={(e) => setEditChemClass(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {CHEMICAL_CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Classification de stockage' : 'Storage Classification'}
              </label>
              <select
                value={editStorageClass}
                onChange={(e) => setEditStorageClass(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {STORAGE_CLASSIFICATIONS.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Quantité actuelle *' : 'Current Quantity *'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={editCurrentQty}
                onChange={(e) => setEditCurrentQty(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Capacité initiale *' : 'Initial Quantity *'}
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={editInitialQty}
                onChange={(e) => setEditInitialQty(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Unité' : 'Unit'}
              </label>
              <select
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value as ChemicalUnit)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                {Object.values(ChemicalUnit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Stock minimum' : 'Min Stock'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={editMinStock}
                onChange={(e) => setEditMinStock(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="text-xs font-semibold text-slate-800">
              {isFr
                ? 'Emplacement Physique (CAB X- Level Y- Left/Right side)'
                : 'Physical Location (CAB X- Level Y- Left/Right side)'}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {isFr ? 'Armoire (Cabinet)' : 'Cabinet'}
                </label>
                <select
                  value={editCabinet}
                  onChange={(e) => setEditCabinet(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {physicalLocations.map((p) => (
                    <option key={p.id} value={p.cabinet}>
                      {p.cabinet} ({p.cabinetLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {isFr ? 'Niveau (Level)' : 'Level'}
                </label>
                <select
                  value={editShelf}
                  onChange={(e) => setEditShelf(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {(
                    physicalLocations.find((p) => p.cabinet === editCabinet)?.shelves || [
                      '1',
                      '2',
                      '3',
                      '4',
                      '5',
                    ]
                  ).map((sh) => (
                    <option key={sh} value={sh}>
                      Level {sh}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {isFr ? 'Côté (Side)' : 'Side'}
                </label>
                <select
                  value={editSide}
                  onChange={(e) => setEditSide(e.target.value as 'Left' | 'Right')}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="Left">Left side</option>
                  <option value="Right">Right side</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {isFr ? 'Position' : 'Position'}
                </label>
                <select
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {(
                    physicalLocations.find((p) => p.cabinet === editCabinet)?.positions || [
                      '01',
                      '02',
                      '03',
                      '04',
                      '05',
                      '06',
                    ]
                  ).map((pos) => (
                    <option key={pos} value={pos}>
                      Pos {pos}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Fournisseur' : 'Supplier'}
              </label>
              <input
                type="text"
                value={editSupplier}
                onChange={(e) => setEditSupplier(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Numéro de lot' : 'Lot Number'}
              </label>
              <input
                type="text"
                value={editLotNumber}
                onChange={(e) => setEditLotNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Date d’expiration' : 'Expiry Date'}
              </label>
              <input
                type="date"
                value={editExpiryDate}
                onChange={(e) => setEditExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowFullEditModal(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Enregistrer toutes les modifications' : 'Save all changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
