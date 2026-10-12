/**
 * JARVIS — Validated Inventory Functions, RBAC Enforcement & Action Confirmation Engine
 * Used by the Express backend (`server.ts`) to execute safe, role-checked inventory queries
 * and stage/execute confirmed stock mutations on real LCSCO inventory data.
 */

import {
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  DisposalWorkflowItem,
  InventoryTransaction,
  NotificationPriority,
  PermissionAction,
  PhysicalLocationConfig,
  Product,
  PurchaseWorkflowItem,
  StockAdjustmentRequest,
  StockRuptureRequest,
  StockRuptureStatus,
  TransactionType,
  UserRole,
} from '../types/inventory';
import {
  assertRolePermission,
  buildStorageLocation,
  calculateWithdrawalMutation,
  computeStockStatus,
  formatPhysicalLocationSummary,
  hasRolePermission,
  sanitizeId,
} from './inventoryDomain';

export interface JarvisUserContext {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  laboratoryIds?: string[];
}

export interface JarvisInventorySnapshot {
  containers: ChemicalContainer[];
  products: Product[];
  transactions: InventoryTransaction[];
  purchaseRequests: PurchaseWorkflowItem[];
  disposalRequests: DisposalWorkflowItem[];
  adjustmentRequests: StockAdjustmentRequest[];
  stockRuptureRequests: StockRuptureRequest[];
  physicalLocations: PhysicalLocationConfig[];
}

export interface JarvisChemicalCard {
  containerId: string;
  productId: string;
  chemicalName: string;
  formula: string;
  casNumber: string;
  currentQuantity: number;
  initialQuantity: number;
  unit: ChemicalUnit;
  status: ContainerStatus;
  room: string;
  cabinet: string;
  cabinetLabel: string;
  side: 'Left' | 'Right';
  shelf: string;
  position: string;
  locationCode: string;
  locationSummary: string;
  expiryDate: string;
  supplier: string;
  lotNumber: string;
  chemicalClassification: string;
  hazardClass: string[];
  storageRequirements: string;
  sdsUrl: string;
}

export type JarvisActionType =
  | 'RECORD_CONSUMPTION'
  | 'CREATE_PURCHASE_REQUEST'
  | 'REPORT_STOCK_RUPTURE'
  | 'CREATE_DISPOSAL_REQUEST'
  | 'REGISTER_CONTAINER';

export interface PendingJarvisAction {
  actionId: string;
  actionType: JarvisActionType;
  createdAt: string;
  requestedByUid: string;
  requestedByName: string;
  requestedByRole: UserRole;
  summaryText: string;
  readBackPrompt: string;
  payload: {
    containerId?: string;
    productId?: string;
    chemicalName: string;
    casNumber?: string;
    formula?: string;
    amount?: number;
    unit?: ChemicalUnit;
    quantityBefore?: number;
    quantityAfter?: number;
    locationCode?: string;
    room?: string;
    cabinet?: string;
    side?: 'Left' | 'Right';
    shelf?: string;
    position?: string;
    supplier?: string;
    lotNumber?: string;
    expiryDate?: string;
    priority?: NotificationPriority;
    reason: string;
  };
}

export interface JarvisToolExecutionOutput {
  toolResult: Record<string, any>;
  cards: JarvisChemicalCard[];
  pendingAction?: PendingJarvisAction | null;
}

/**
 * Common chemical synonyms to improve natural voice & text search accuracy
 */
const CHEMICAL_SYNONYMS: Record<string, string[]> = {
  ethanol: ['ethyl alcohol', 'etoh', 'alcool éthylique', 'éthanol', 'كحول إيثيلي', 'إيثانول', '64-17-5'],
  methanol: ['methyl alcohol', 'meoh', 'méthanol', 'كحول ميثيلي', 'ميثانول', '67-56-1'],
  acetone: ['propanone', 'acétone', 'أسيتون', '67-64-1'],
  dichloromethane: ['dcm', 'methylene chloride', 'dichlorométhane', 'ثنائي كلورو ميثان', '75-09-2'],
  tetrahydrofuran: ['thf', 'tétrahydrofurane', 'رباعي هيدرو الفوران', '109-99-9'],
  'ethyl acetate': ['etoac', 'acétate d’éthyle', 'acetate d ethyle', 'أسيتات الإيثيل', '141-78-6'],
  'sodium borohydride': ['nabh4', 'borohydrure de sodium', 'بورهيدريد الصوديوم', '16940-66-2'],
  'potassium carbonate': ['k2co3', 'carbonate de potassium', 'كربونات البوتاسيوم', '584-08-7'],
  'sodium hydroxide': ['naoh', 'caustic soda', 'hydroxyde de sodium', 'soude', 'هيدروكسيد الصوديوم', '1310-73-2'],
  'hydrochloric acid': ['hcl', 'acide chlorhydrique', 'حمض الهيدروكلوريك', '7647-01-0'],
  'sulfuric acid': ['h2so4', 'acide sulfurique', 'حمض الكبريتيك', '7664-93-9'],
  '4-methoxyaniline': ['p-anisidine', 'para-anisidine', '4-méthoxyaniline', '104-94-9'],
  benzaldehyde: ['benzaldéhyde', 'بنزالديهايد', '100-52-7'],
  palladium: ['pd/c', 'pd(pph3)4', 'pd(oac)2', 'palladium on carbon', 'tetrakis', 'catalyseur palladium', 'بلاديوم'],
};

function normalizeSearchToken(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function buildChemicalCard(
  container: ChemicalContainer,
  productMap: Map<string, Product>,
  locations: PhysicalLocationConfig[]
): JarvisChemicalCard {
  const prod = productMap.get(container.productId);
  const rawUnit = (container.location?.unit || 'CAB 1').trim();
  const cabCode = /^cab\b/i.test(rawUnit)
    ? rawUnit.replace(/^cab\s*[-:]?\s*/i, 'CAB ').toUpperCase()
    : /^\d+$/.test(rawUnit)
    ? `CAB ${rawUnit}`
    : rawUnit.toUpperCase();
  const matchedCab = locations.find(
    (l) => l.cabinet.toUpperCase() === cabCode.toUpperCase()
  );
  const side: 'Left' | 'Right' =
    container.location?.side === 'Right' ||
    /right\s*side|-R-/i.test(container.location?.code || '')
      ? 'Right'
      : 'Left';
  const shelf =
    String(container.location?.shelf || '1')
      .replace(/^(level|lvl|shelf|s)\s*[-:]?\s*/i, '')
      .replace(/^0+(?=\d)/, '') || '1';
  const defaultCode = `${cabCode}- Level ${shelf}- ${
    side === 'Right' ? 'Right side' : 'Left side'
  }`;

  return {
    containerId: container.containerId,
    productId: container.productId,
    chemicalName: prod?.chemicalName || container.productId,
    formula: prod?.formula || '—',
    casNumber: prod?.casNumber || '—',
    currentQuantity: container.currentQuantity,
    initialQuantity: container.initialQuantity,
    unit: container.unit,
    status: container.status,
    room: container.location?.room || '204',
    cabinet: cabCode,
    cabinetLabel:
      container.location?.cabinetLabel ||
      matchedCab?.cabinetLabel ||
      `${cabCode}`,
    side,
    shelf,
    position: String(container.location?.position || '01').padStart(2, '0'),
    locationCode: container.location?.code || defaultCode,
    locationSummary: formatPhysicalLocationSummary(
      {
        building: container.location?.building || 'LCSCO',
        room: container.location?.room || '204',
        unit: cabCode,
        side,
        shelf,
        position: String(container.location?.position || '01'),
        code: container.location?.code || defaultCode,
      },
      'en'
    ),
    expiryDate: container.expiryDate,
    supplier: container.supplier,
    lotNumber: container.lotNumber,
    chemicalClassification:
      String(
        container.chemicalClassification || prod?.chemicalClassification || 'Solvents'
      ),
    hazardClass: prod?.hazardClass || [],
    storageRequirements: prod?.storageRequirements || container.storageCondition || 'Standard',
    sdsUrl: prod?.sdsUrl || 'https://pubchem.ncbi.nlm.nih.gov',
  };
}

function getProductMap(products: Product[]): Map<string, Product> {
  const map = new Map<string, Product>();
  products.forEach((p) => map.set(p.productId, p));
  return map;
}

/**
 * Matches a container + product against a free-text query, CAS number, cabinet, or classification
 */
function matchesChemicalSearch(
  card: JarvisChemicalCard,
  params: {
    query?: string;
    classification?: string;
    cabinet?: string;
    casNumber?: string;
  }
): boolean {
  if (params.cabinet && params.cabinet.trim()) {
    const targetCab = params.cabinet
      .trim()
      .toUpperCase()
      .replace(/^CABINET\s+/i, '')
      .replace(/^ARMOIRE\s+/i, '')
      .replace(/^CAB-/i, '');
    if (card.cabinet.toUpperCase() !== targetCab) {
      return false;
    }
  }

  if (params.casNumber && params.casNumber.trim()) {
    const cleanCas = params.casNumber.trim().toLowerCase();
    if (!card.casNumber.toLowerCase().includes(cleanCas)) {
      return false;
    }
  }

  if (params.classification && params.classification.trim()) {
    const targetCls = normalizeSearchToken(params.classification);
    const cardCls = normalizeSearchToken(card.chemicalClassification);
    const nameNorm = normalizeSearchToken(card.chemicalName);
    const isCatalystQuery =
      targetCls.includes('palladium') ||
      targetCls.includes('catalyst') ||
      targetCls.includes('organometallic');
    if (isCatalystQuery) {
      if (
        !cardCls.includes('organometallic') &&
        !nameNorm.includes('palladium') &&
        !nameNorm.includes('pd') &&
        !nameNorm.includes('catalyst')
      ) {
        return false;
      }
    } else if (
      !cardCls.includes(targetCls) &&
      !targetCls.includes(cardCls.replace(/s$/, ''))
    ) {
      return false;
    }
  }

  if (params.query && params.query.trim()) {
    const q = normalizeSearchToken(params.query);
    if (
      q === 'all' ||
      q === 'tous' ||
      q === 'everything' ||
      q === 'inventory' ||
      q === 'inventaire'
    ) {
      return true;
    }

    const haystack = normalizeSearchToken(
      `${card.chemicalName} ${card.formula} ${card.casNumber} ${card.containerId} ${card.chemicalClassification} ${card.cabinetLabel} ${card.locationCode} ${card.supplier}`
    );

    if (haystack.includes(q)) return true;

    // Check synonym expansion
    for (const [canonical, synonyms] of Object.entries(CHEMICAL_SYNONYMS)) {
      const canonicalNorm = normalizeSearchToken(canonical);
      const matchesCanonicalOrSyn =
        canonicalNorm.includes(q) ||
        q.includes(canonicalNorm) ||
        synonyms.some((s) => {
          const sn = normalizeSearchToken(s);
          return sn === q || (q.length >= 3 && (sn.includes(q) || q.includes(sn)));
        });

      if (matchesCanonicalOrSyn) {
        if (
          haystack.includes(canonicalNorm) ||
          synonyms.some((s) => haystack.includes(normalizeSearchToken(s)))
        ) {
          return true;
        }
      }
    }

    // Token-level match
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length > 0 && tokens.every((tok) => haystack.includes(tok))) {
      return true;
    }

    return false;
  }

  return true;
}

/**
 * 1. searchChemicals()
 */
export function jarvisSearchChemicals(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: {
    query?: string;
    classification?: string;
    cabinet?: string;
    casNumber?: string;
  }
): JarvisToolExecutionOutput {
  assertRolePermission(user.role, PermissionAction.VIEW_INVENTORY);
  const productMap = getProductMap(snapshot.products);
  const allCards = snapshot.containers.map((c) =>
    buildChemicalCard(c, productMap, snapshot.physicalLocations)
  );

  const matched = allCards.filter((card) => matchesChemicalSearch(card, args));

  // Group by distinct productId to check if multiple distinct chemicals matched
  const distinctChemicals = Array.from(new Set(matched.map((m) => m.chemicalName)));

  return {
    toolResult: {
      foundCount: matched.length,
      distinctChemicalCount: distinctChemicals.length,
      distinctChemicalNames: distinctChemicals,
      ambiguousMultipleChemicals:
        Boolean(args.query && args.query.trim()) && distinctChemicals.length > 1,
      items: matched.slice(0, 12).map((m) => ({
        containerId: m.containerId,
        chemicalName: m.chemicalName,
        formula: m.formula,
        casNumber: m.casNumber,
        currentQuantity: m.currentQuantity,
        initialQuantity: m.initialQuantity,
        unit: m.unit,
        status: m.status,
        location: m.locationSummary,
        locationCode: m.locationCode,
        cabinet: m.cabinet,
        side: m.side,
        shelf: m.shelf,
        position: m.position,
        expiryDate: m.expiryDate,
        chemicalClassification: m.chemicalClassification,
      })),
    },
    cards: matched.slice(0, 6),
  };
}

/**
 * 2. getChemicalDetails()
 */
export function jarvisGetChemicalDetails(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: { identifier: string }
): JarvisToolExecutionOutput {
  assertRolePermission(user.role, PermissionAction.VIEW_CHEMICAL_DETAILS_AND_SDS);
  const productMap = getProductMap(snapshot.products);
  const allCards = snapshot.containers.map((c) =>
    buildChemicalCard(c, productMap, snapshot.physicalLocations)
  );

  const idNorm = normalizeSearchToken(args.identifier);
  const exactContainer = allCards.find(
    (c) =>
      normalizeSearchToken(c.containerId) === idNorm ||
      normalizeSearchToken(c.casNumber) === idNorm
  );

  const matched = exactContainer
    ? [exactContainer]
    : allCards.filter((c) => matchesChemicalSearch(c, { query: args.identifier }));

  const distinctNames = Array.from(new Set(matched.map((m) => m.chemicalName)));

  return {
    toolResult: {
      found: matched.length > 0,
      matchCount: matched.length,
      distinctChemicalNames: distinctNames,
      needsClarification: distinctNames.length > 1,
      details: matched.slice(0, 6).map((m) => ({
        containerId: m.containerId,
        chemicalName: m.chemicalName,
        formula: m.formula,
        casNumber: m.casNumber,
        currentQuantity: m.currentQuantity,
        initialQuantity: m.initialQuantity,
        unit: m.unit,
        status: m.status,
        locationSummary: m.locationSummary,
        locationCode: m.locationCode,
        supplier: m.supplier,
        lotNumber: m.lotNumber,
        expiryDate: m.expiryDate,
        chemicalClassification: m.chemicalClassification,
        hazardClass: m.hazardClass,
        storageRequirements: m.storageRequirements,
        sdsUrl: m.sdsUrl,
      })),
    },
    cards: matched.slice(0, 4),
  };
}

/**
 * 3. getStockLevel()
 */
export function jarvisGetStockLevel(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: {
    chemicalQuery: string;
    requiredAmount?: number;
    requiredUnit?: string;
  }
): JarvisToolExecutionOutput {
  assertRolePermission(user.role, PermissionAction.VIEW_INVENTORY);
  const productMap = getProductMap(snapshot.products);
  const allCards = snapshot.containers.map((c) =>
    buildChemicalCard(c, productMap, snapshot.physicalLocations)
  );

  const matched = allCards.filter((c) =>
    matchesChemicalSearch(c, { query: args.chemicalQuery })
  );
  const distinctNames = Array.from(new Set(matched.map((m) => m.chemicalName)));

  // Calculate total available across active (non-quarantined/non-disposal) bottles
  const usableBottles = matched.filter(
    (m) =>
      m.status !== ContainerStatus.QUARANTINED &&
      m.status !== ContainerStatus.DISPOSAL_REQUIRED &&
      m.status !== ContainerStatus.EXPIRED &&
      m.status !== ContainerStatus.NEEDS_IDENTIFICATION
  );

  const totalByUnit: Record<string, number> = {};
  usableBottles.forEach((b) => {
    totalByUnit[b.unit] = Math.round(((totalByUnit[b.unit] || 0) + b.currentQuantity) * 1000) / 1000;
  });

  let sufficientForExperiment: boolean | null = null;
  if (typeof args.requiredAmount === 'number' && args.requiredAmount > 0) {
    const unitKey = args.requiredUnit || usableBottles[0]?.unit || 'mL';
    const availableInUnit = totalByUnit[unitKey] ?? 0;
    sufficientForExperiment = availableInUnit >= args.requiredAmount;
  }

  return {
    toolResult: {
      found: matched.length > 0,
      chemicalQuery: args.chemicalQuery,
      distinctChemicalNames: distinctNames,
      needsClarification: distinctNames.length > 1,
      totalAvailableByUnit: totalByUnit,
      usableContainerCount: usableBottles.length,
      totalContainerCount: matched.length,
      sufficientForExperiment,
      requiredAmount: args.requiredAmount,
      requiredUnit: args.requiredUnit,
      containers: matched.map((m) => ({
        containerId: m.containerId,
        chemicalName: m.chemicalName,
        currentQuantity: m.currentQuantity,
        initialQuantity: m.initialQuantity,
        unit: m.unit,
        status: m.status,
        location: m.locationSummary,
        locationCode: m.locationCode,
      })),
    },
    cards: matched.slice(0, 5),
  };
}

/**
 * 4. getStorageLocation()
 */
export function jarvisGetStorageLocation(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: { chemicalQuery: string }
): JarvisToolExecutionOutput {
  assertRolePermission(user.role, PermissionAction.VIEW_INVENTORY);
  const productMap = getProductMap(snapshot.products);
  const allCards = snapshot.containers.map((c) =>
    buildChemicalCard(c, productMap, snapshot.physicalLocations)
  );

  const matched = allCards.filter((c) =>
    matchesChemicalSearch(c, { query: args.chemicalQuery })
  );
  const distinctNames = Array.from(new Set(matched.map((m) => m.chemicalName)));

  return {
    toolResult: {
      found: matched.length > 0,
      distinctChemicalNames: distinctNames,
      needsClarification: distinctNames.length > 1,
      locations: matched.map((m) => ({
        containerId: m.containerId,
        chemicalName: m.chemicalName,
        room: m.room,
        cabinet: m.cabinet,
        cabinetLabel: m.cabinetLabel,
        side: m.side,
        shelf: m.shelf,
        position: m.position,
        locationCode: m.locationCode,
        locationSummary: m.locationSummary,
        currentQuantity: m.currentQuantity,
        unit: m.unit,
      })),
    },
    cards: matched.slice(0, 5),
  };
}

/**
 * 5. getLowStockItems()
 */
export function jarvisGetLowStockItems(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext
): JarvisToolExecutionOutput {
  assertRolePermission(user.role, PermissionAction.VIEW_INVENTORY);
  const productMap = getProductMap(snapshot.products);
  const lowContainers = snapshot.containers.filter(
    (c) =>
      c.status === ContainerStatus.LOW_STOCK ||
      c.status === ContainerStatus.NEARLY_EMPTY
  );
  const cards = lowContainers.map((c) =>
    buildChemicalCard(c, productMap, snapshot.physicalLocations)
  );

  const activeRuptures = snapshot.stockRuptureRequests.filter(
    (r) =>
      r.status !== StockRuptureStatus.RESOLVED &&
      r.status !== StockRuptureStatus.REJECTED
  );

  return {
    toolResult: {
      lowStockContainerCount: cards.length,
      activeRuptureReportCount: activeRuptures.length,
      lowStockItems: cards.map((c) => ({
        containerId: c.containerId,
        chemicalName: c.chemicalName,
        currentQuantity: c.currentQuantity,
        initialQuantity: c.initialQuantity,
        unit: c.unit,
        status: c.status,
        location: c.locationSummary,
      })),
      activeRuptures: activeRuptures.map((r) => ({
        ruptureId: r.ruptureId,
        containerId: r.containerId,
        chemicalName: r.chemicalName,
        priority: r.priority,
        status: r.status,
        reportedByName: r.reportedByName,
      })),
    },
    cards: cards.slice(0, 6),
  };
}

/**
 * 6. getExpiringChemicals()
 */
export function jarvisGetExpiringChemicals(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: { withinDays?: number }
): JarvisToolExecutionOutput {
  assertRolePermission(user.role, PermissionAction.VIEW_INVENTORY);
  const windowDays = typeof args.withinDays === 'number' && args.withinDays > 0 ? args.withinDays : 180;
  const now = new Date();
  const productMap = getProductMap(snapshot.products);

  const expiring = snapshot.containers.filter((c) => {
    if (c.status === ContainerStatus.EXPIRED) return true;
    const exp = new Date(c.expiryDate);
    if (isNaN(exp.getTime())) return false;
    const diffDays = (exp.getTime() - now.getTime()) / (1000 * 3600 * 24);
    return diffDays <= windowDays;
  });

  const cards = expiring.map((c) =>
    buildChemicalCard(c, productMap, snapshot.physicalLocations)
  );

  return {
    toolResult: {
      withinDays: windowDays,
      count: cards.length,
      items: cards.map((c) => ({
        containerId: c.containerId,
        chemicalName: c.chemicalName,
        expiryDate: c.expiryDate,
        currentQuantity: c.currentQuantity,
        unit: c.unit,
        location: c.locationSummary,
        status: c.status,
      })),
    },
    cards: cards.slice(0, 6),
  };
}

/**
 * 7. getStockMovementHistory()
 */
export function jarvisGetStockMovementHistory(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: {
    chemicalOrContainerQuery?: string;
    daysBack?: number;
    limit?: number;
  }
): JarvisToolExecutionOutput {
  assertRolePermission(user.role, PermissionAction.VIEW_INVENTORY);
  const productMap = getProductMap(snapshot.products);
  const maxItems = Math.min(args.limit || 10, 25);
  const q = normalizeSearchToken(args.chemicalOrContainerQuery || '');

  const filteredTx = snapshot.transactions.filter((tx) => {
    if (typeof args.daysBack === 'number' && args.daysBack > 0) {
      const txTime = new Date(String(tx.timestamp)).getTime();
      if (!isNaN(txTime)) {
        const cutoff = Date.now() - args.daysBack * 24 * 3600 * 1000;
        if (txTime < cutoff) return false;
      }
    }

    if (!q) return true;
    const prod = productMap.get(tx.productId);
    const hay = normalizeSearchToken(
      `${tx.containerId} ${tx.productId} ${prod?.chemicalName || ''} ${prod?.casNumber || ''} ${prod?.formula || ''} ${tx.userName} ${tx.reason}`
    );
    if (hay.includes(q)) return true;

    for (const [canonical, synonyms] of Object.entries(CHEMICAL_SYNONYMS)) {
      const cn = normalizeSearchToken(canonical);
      if (cn.includes(q) || q.includes(cn) || synonyms.some((s) => normalizeSearchToken(s) === q)) {
        if (hay.includes(cn)) return true;
      }
    }
    return false;
  });

  // Compute total consumed across matching withdrawal transactions
  let totalConsumed = 0;
  let consumedUnit = '';
  filteredTx.forEach((tx) => {
    if (tx.type === TransactionType.WITHDRAWAL && tx.quantityChange < 0) {
      totalConsumed = Math.round((totalConsumed + Math.abs(tx.quantityChange)) * 1000) / 1000;
      if (!consumedUnit) consumedUnit = tx.unit;
    }
  });

  const lastUsage = filteredTx.find((tx) => tx.type === TransactionType.WITHDRAWAL) || filteredTx[0] || null;
  const lastUsageProd = lastUsage ? productMap.get(lastUsage.productId) : null;

  return {
    toolResult: {
      matchCount: filteredTx.length,
      totalConsumedInPeriod: totalConsumed,
      unit: consumedUnit || 'g/mL',
      lastRecordedMovement: lastUsage
        ? {
            transactionId: lastUsage.transactionId,
            type: lastUsage.type,
            userName: lastUsage.userName,
            timestamp: String(lastUsage.timestamp),
            containerId: lastUsage.containerId,
            chemicalName: lastUsageProd?.chemicalName || lastUsage.productId,
            quantityChange: lastUsage.quantityChange,
            unit: lastUsage.unit,
            reason: lastUsage.reason,
          }
        : null,
      recentTransactions: filteredTx.slice(0, maxItems).map((tx) => {
        const prod = productMap.get(tx.productId);
        return {
          transactionId: tx.transactionId,
          type: tx.type,
          timestamp: String(tx.timestamp),
          userName: tx.userName,
          containerId: tx.containerId,
          chemicalName: prod?.chemicalName || tx.productId,
          quantityChange: tx.quantityChange,
          quantityBefore: tx.quantityBefore,
          quantityAfter: tx.quantityAfter,
          unit: tx.unit,
          reason: tx.reason,
        };
      }),
    },
    cards: [],
  };
}

/**
 * 8. getUserPendingRequests() — Strictly filtered by user role & ownership
 */
export function jarvisGetUserPendingRequests(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext
): JarvisToolExecutionOutput {
  const isDirectorOrProf =
    user.role === UserRole.ADMIN || user.role === UserRole.PROFESSOR;
  const isEngineer = user.role === UserRole.TECHNICIAN;

  if (isDirectorOrProf) {
    const pendingPurchases = snapshot.purchaseRequests.filter(
      (p) => p.status === 'REQUESTED'
    );
    const pendingDisposals = snapshot.disposalRequests.filter(
      (d) => d.status === 'REQUESTED'
    );
    const pendingAdjustments = snapshot.adjustmentRequests.filter(
      (a) => a.status === 'PENDING'
    );
    const activeRuptures = snapshot.stockRuptureRequests.filter(
      (r) =>
        r.status !== StockRuptureStatus.RESOLVED &&
        r.status !== StockRuptureStatus.REJECTED
    );

    return {
      toolResult: {
        scope: 'SUPERVISOR_AND_DIRECTOR_VIEW',
        pendingPurchaseCount: pendingPurchases.length,
        pendingDisposalCount: pendingDisposals.length,
        pendingAdjustmentCount: pendingAdjustments.length,
        activeRuptureCount: activeRuptures.length,
        pendingPurchases: pendingPurchases.slice(0, 8),
        pendingDisposals: pendingDisposals.slice(0, 8),
        pendingAdjustments: pendingAdjustments.slice(0, 8),
        activeRuptures: activeRuptures.slice(0, 8),
      },
      cards: [],
    };
  }

  if (isEngineer) {
    const deliveriesToReceive = snapshot.purchaseRequests.filter(
      (p) => p.status === 'APPROVED' || p.status === 'ORDERED'
    );
    const approvedDisposals = snapshot.disposalRequests.filter(
      (d) => d.status === 'APPROVED'
    );
    const activeRuptures = snapshot.stockRuptureRequests.filter(
      (r) =>
        r.status !== StockRuptureStatus.RESOLVED &&
        r.status !== StockRuptureStatus.REJECTED
    );

    return {
      toolResult: {
        scope: 'LAB_ENGINEER_OPERATIONAL_VIEW',
        incomingDeliveriesCount: deliveriesToReceive.length,
        approvedDisposalsAwaitingActionCount: approvedDisposals.length,
        activeRupturesCount: activeRuptures.length,
        incomingDeliveries: deliveriesToReceive.slice(0, 8),
        approvedDisposals: approvedDisposals.slice(0, 8),
        activeRuptures: activeRuptures.slice(0, 8),
      },
      cards: [],
    };
  }

  // PhD Student: Only show their own requests (never reveal other users' private records)
  const myPurchases = snapshot.purchaseRequests.filter(
    (p) => p.requestedByUid === user.uid
  );
  const myDisposals = snapshot.disposalRequests.filter(
    (d) => d.requestedByUid === user.uid
  );

  return {
    toolResult: {
      scope: 'PERSONAL_RESEARCHER_REQUESTS_ONLY',
      myPurchaseRequestCount: myPurchases.length,
      myDisposalRequestCount: myDisposals.length,
      myPurchases: myPurchases.slice(0, 8),
      myDisposals: myDisposals.slice(0, 8),
    },
    cards: [],
  };
}

/**
 * 9. getInventoryStatistics()
 */
export function jarvisGetInventoryStatistics(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext
): JarvisToolExecutionOutput {
  assertRolePermission(user.role, PermissionAction.VIEW_INVENTORY);
  const lowStockCount = snapshot.containers.filter(
    (c) =>
      c.status === ContainerStatus.LOW_STOCK ||
      c.status === ContainerStatus.NEARLY_EMPTY
  ).length;

  const activeRuptureCount = snapshot.stockRuptureRequests.filter(
    (r) =>
      r.status !== StockRuptureStatus.RESOLVED &&
      r.status !== StockRuptureStatus.REJECTED
  ).length;

  const cabinetBreakdown = snapshot.physicalLocations.map((loc) => {
    const count = snapshot.containers.filter(
      (c) => (c.location?.unit || '').toUpperCase() === loc.cabinet.toUpperCase()
    ).length;
    return {
      cabinet: loc.cabinet,
      label: loc.cabinetLabel,
      room: loc.room,
      containerCount: count,
    };
  });

  return {
    toolResult: {
      totalContainers: snapshot.containers.length,
      totalCatalogProducts: snapshot.products.length,
      lowStockCount,
      activeRuptureCount,
      totalCabinets: snapshot.physicalLocations.length,
      cabinetBreakdown,
    },
    cards: [],
  };
}

/**
 * 10. STAGE 1 PROPOSAL: proposeRecordConsumption()
 * Never mutates inventory directly. Validates permissions, chemical, unit, and quantity,
 * then returns a PendingJarvisAction requiring explicit user confirmation.
 */
export function jarvisProposeRecordConsumption(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: {
    chemicalOrContainerQuery: string;
    amount: number;
    unit: string;
    reason?: string;
  }
): JarvisToolExecutionOutput {
  if (!hasRolePermission(user.role, PermissionAction.RECORD_CONSUMPTION)) {
    return {
      toolResult: {
        status: 'UNAUTHORIZED',
        message: `Role "${user.role}" is not authorized to record chemical consumption.`,
      },
      cards: [],
    };
  }

  const productMap = getProductMap(snapshot.products);
  const allCards = snapshot.containers.map((c) =>
    buildChemicalCard(c, productMap, snapshot.physicalLocations)
  );

  const qNorm = normalizeSearchToken(args.chemicalOrContainerQuery);
  const exactBottle = snapshot.containers.find(
    (c) => normalizeSearchToken(c.containerId) === qNorm
  );

  const matchedContainers = exactBottle
    ? [exactBottle]
    : snapshot.containers.filter((c) => {
        const card = buildChemicalCard(c, productMap, snapshot.physicalLocations);
        return matchesChemicalSearch(card, { query: args.chemicalOrContainerQuery });
      });

  if (matchedContainers.length === 0) {
    return {
      toolResult: {
        status: 'NOT_FOUND',
        message: `No chemical or container matching "${args.chemicalOrContainerQuery}" was found in the inventory.`,
      },
      cards: [],
    };
  }

  const distinctChemNames = Array.from(
    new Set(
      matchedContainers.map(
        (c) => productMap.get(c.productId)?.chemicalName || c.productId
      )
    )
  );

  if (distinctChemNames.length > 1) {
    return {
      toolResult: {
        status: 'AMBIGUOUS_CHEMICAL',
        message: `Multiple chemicals match "${args.chemicalOrContainerQuery}": ${distinctChemNames.join(', ')}. Please ask the user which exact chemical or container ID they used.`,
        candidates: matchedContainers.slice(0, 5).map((c) => ({
          containerId: c.containerId,
          chemicalName: productMap.get(c.productId)?.chemicalName || c.productId,
          currentQuantity: c.currentQuantity,
          unit: c.unit,
          location: c.location.code,
        })),
      },
      cards: matchedContainers
        .slice(0, 4)
        .map((c) => buildChemicalCard(c, productMap, snapshot.physicalLocations)),
    };
  }

  const targetContainer = matchedContainers[0];
  const targetCard = buildChemicalCard(
    targetContainer,
    productMap,
    snapshot.physicalLocations
  );

  // Normalize unit
  const rawUnit = (args.unit || targetContainer.unit).trim();
  const normalizedUnit: ChemicalUnit =
    rawUnit.toLowerCase() === 'g' || rawUnit.toLowerCase().startsWith('gram')
      ? ChemicalUnit.GRAM
      : rawUnit.toLowerCase() === 'mg' || rawUnit.toLowerCase().startsWith('milligram')
      ? ChemicalUnit.MILLIGRAM
      : rawUnit.toLowerCase() === 'kg' || rawUnit.toLowerCase().startsWith('kilogram')
      ? ChemicalUnit.KILOGRAM
      : rawUnit.toLowerCase() === 'l' || rawUnit.toLowerCase().startsWith('liter') || rawUnit.toLowerCase().startsWith('litre')
      ? ChemicalUnit.LITER
      : rawUnit.toLowerCase() === 'ml' || rawUnit.toLowerCase().startsWith('millilit')
      ? ChemicalUnit.MILLILITER
      : (rawUnit as ChemicalUnit);

  try {
    const calc = calculateWithdrawalMutation(
      targetContainer,
      Number(args.amount),
      normalizedUnit,
      args.reason?.trim() || 'Voice-logged bench consumption via JARVIS'
    );

    const actionId = `JRV-WD-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    const pendingAction: PendingJarvisAction = {
      actionId,
      actionType: 'RECORD_CONSUMPTION',
      createdAt: new Date().toISOString(),
      requestedByUid: user.uid,
      requestedByName: user.fullName,
      requestedByRole: user.role,
      summaryText: `Withdraw ${args.amount} ${normalizedUnit} of ${targetCard.chemicalName} (${targetContainer.containerId})`,
      readBackPrompt: `You want to record the consumption of ${args.amount} ${normalizedUnit} of ${targetCard.chemicalName} from container ${targetContainer.containerId} (${targetCard.locationSummary}). Remaining stock will be ${calc.quantityAfter} ${normalizedUnit}. Is that correct?`,
      payload: {
        containerId: targetContainer.containerId,
        productId: targetContainer.productId,
        chemicalName: targetCard.chemicalName,
        casNumber: targetCard.casNumber,
        formula: targetCard.formula,
        amount: Number(args.amount),
        unit: normalizedUnit,
        quantityBefore: calc.quantityBefore,
        quantityAfter: calc.quantityAfter,
        locationCode: targetCard.locationCode,
        reason: args.reason?.trim() || 'Laboratory synthesis / Voice-logged via JARVIS',
      },
    };

    return {
      toolResult: {
        status: 'CONFIRMATION_REQUIRED',
        importantInstruction:
          'DO NOT say this transaction is completed yet! Read back the exact details and ask the user for explicit confirmation.',
        pendingAction,
      },
      cards: [targetCard],
      pendingAction,
    };
  } catch (validationErr: any) {
    return {
      toolResult: {
        status: 'VALIDATION_ERROR',
        message: validationErr?.message || 'Invalid consumption amount or unit.',
        containerUnit: targetContainer.unit,
        availableQuantity: targetContainer.currentQuantity,
      },
      cards: [targetCard],
    };
  }
}

/**
 * 11. STAGE 1 PROPOSAL: proposePurchaseRequest()
 */
export function jarvisProposePurchaseRequest(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: {
    chemicalName: string;
    requestedQuantity: number;
    unit: string;
    reason?: string;
    supplier?: string;
  }
): JarvisToolExecutionOutput {
  if (!hasRolePermission(user.role, PermissionAction.CREATE_PURCHASE_REQUEST)) {
    return {
      toolResult: {
        status: 'UNAUTHORIZED',
        message: `Role "${user.role}" is not authorized to submit purchase requests.`,
      },
      cards: [],
    };
  }

  const amount = Number(args.requestedQuantity);
  if (isNaN(amount) || amount <= 0) {
    return {
      toolResult: {
        status: 'VALIDATION_ERROR',
        message: 'Requested purchase quantity must be greater than 0.',
      },
      cards: [],
    };
  }

  const rawUnit = (args.unit || 'g').trim().toLowerCase();
  const unit: ChemicalUnit =
    rawUnit === 'ml' || rawUnit.startsWith('millilit')
      ? ChemicalUnit.MILLILITER
      : rawUnit === 'l' || rawUnit.startsWith('lit')
      ? ChemicalUnit.LITER
      : rawUnit === 'kg'
      ? ChemicalUnit.KILOGRAM
      : rawUnit === 'mg'
      ? ChemicalUnit.MILLIGRAM
      : ChemicalUnit.GRAM;

  const matchedProd = snapshot.products.find((p) =>
    normalizeSearchToken(p.chemicalName).includes(
      normalizeSearchToken(args.chemicalName)
    )
  );

  const actionId = `JRV-PUR-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  const pendingAction: PendingJarvisAction = {
    actionId,
    actionType: 'CREATE_PURCHASE_REQUEST',
    createdAt: new Date().toISOString(),
    requestedByUid: user.uid,
    requestedByName: user.fullName,
    requestedByRole: user.role,
    summaryText: `Request purchase of ${amount} ${unit} of ${matchedProd?.chemicalName || args.chemicalName}`,
    readBackPrompt: `You want to submit a purchase request for ${amount} ${unit} of ${matchedProd?.chemicalName || args.chemicalName} (CAS: ${matchedProd?.casNumber || 'N/A'}). Shall I submit this request for approval?`,
    payload: {
      productId: matchedProd?.productId,
      chemicalName: matchedProd?.chemicalName || args.chemicalName.trim(),
      casNumber: matchedProd?.casNumber || 'N/A',
      formula: matchedProd?.formula || 'N/A',
      amount,
      unit,
      supplier: args.supplier?.trim() || 'Sigma-Aldrich',
      reason: args.reason?.trim() || 'Requested via JARVIS Voice Assistant',
    },
  };

  return {
    toolResult: {
      status: 'CONFIRMATION_REQUIRED',
      importantInstruction:
        'Read back the purchase request details and ask the user for confirmation before submitting.',
      pendingAction,
    },
    cards: [],
    pendingAction,
  };
}

/**
 * 12. STAGE 1 PROPOSAL: proposeStockRuptureReport()
 */
export function jarvisProposeStockRuptureReport(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: {
    chemicalOrContainerQuery: string;
    comment?: string;
  }
): JarvisToolExecutionOutput {
  if (!hasRolePermission(user.role, PermissionAction.REPORT_STOCK_RUPTURE)) {
    return {
      toolResult: {
        status: 'UNAUTHORIZED',
        message: `Role "${user.role}" is not authorized to report stock ruptures.`,
      },
      cards: [],
    };
  }

  const productMap = getProductMap(snapshot.products);
  const matched = snapshot.containers.filter((c) => {
    const card = buildChemicalCard(c, productMap, snapshot.physicalLocations);
    return matchesChemicalSearch(card, { query: args.chemicalOrContainerQuery });
  });

  if (matched.length === 0) {
    return {
      toolResult: {
        status: 'NOT_FOUND',
        message: `Could not find any container matching "${args.chemicalOrContainerQuery}" to report as empty.`,
      },
      cards: [],
    };
  }

  const target = matched[0];
  const card = buildChemicalCard(target, productMap, snapshot.physicalLocations);
  const actionId = `JRV-RUP-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  const pendingAction: PendingJarvisAction = {
    actionId,
    actionType: 'REPORT_STOCK_RUPTURE',
    createdAt: new Date().toISOString(),
    requestedByUid: user.uid,
    requestedByName: user.fullName,
    requestedByRole: user.role,
    summaryText: `Report critical stock rupture for ${card.chemicalName} (${card.containerId})`,
    readBackPrompt: `You want to report a critical stock rupture for ${card.chemicalName} (Container ${card.containerId} at ${card.locationSummary}). This will notify the Director and Laboratory Engineer. Please confirm.`,
    payload: {
      containerId: card.containerId,
      productId: card.productId,
      chemicalName: card.chemicalName,
      casNumber: card.casNumber,
      formula: card.formula,
      locationCode: card.locationCode,
      priority: NotificationPriority.CRITICAL,
      reason: args.comment?.trim() || 'Bottle reported empty via JARVIS Voice Assistant',
    },
  };

  return {
    toolResult: {
      status: 'CONFIRMATION_REQUIRED',
      importantInstruction:
        'Ask the user to confirm reporting this stock rupture before recording it.',
      pendingAction,
    },
    cards: [card],
    pendingAction,
  };
}

/**
 * 13. STAGE 1 PROPOSAL: proposeRegisterContainer()
 */
export function jarvisProposeRegisterContainer(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  args: {
    chemicalName: string;
    quantity: number;
    unit: string;
    cabinet?: string;
    side?: 'Left' | 'Right';
    shelf?: string;
    position?: string;
    lotNumber?: string;
    supplier?: string;
  }
): JarvisToolExecutionOutput {
  if (!hasRolePermission(user.role, PermissionAction.ADD_NEW_CHEMICAL)) {
    return {
      toolResult: {
        status: 'UNAUTHORIZED',
        message: `Permission Denied: Role "${user.role}" cannot register new containers directly. PhD students should submit a purchase request instead.`,
      },
      cards: [],
    };
  }

  const amount = Number(args.quantity);
  if (isNaN(amount) || amount <= 0) {
    return {
      toolResult: {
        status: 'VALIDATION_ERROR',
        message: 'Container quantity must be a positive number.',
      },
      cards: [],
    };
  }

  const rawUnit = (args.unit || 'mL').trim().toLowerCase();
  const unit: ChemicalUnit =
    rawUnit === 'g' || rawUnit.startsWith('gram')
      ? ChemicalUnit.GRAM
      : rawUnit === 'l' || rawUnit.startsWith('lit')
      ? ChemicalUnit.LITER
      : rawUnit === 'kg'
      ? ChemicalUnit.KILOGRAM
      : rawUnit === 'mg'
      ? ChemicalUnit.MILLIGRAM
      : ChemicalUnit.MILLILITER;

  const matchedProd = snapshot.products.find((p) =>
    normalizeSearchToken(p.chemicalName).includes(
      normalizeSearchToken(args.chemicalName)
    )
  );

  const rawCab = (args.cabinet || 'CAB 1').trim();
  const cabCode = /^cab\b/i.test(rawCab)
    ? rawCab.replace(/^cab\s*[-:]?\s*/i, 'CAB ').toUpperCase()
    : /^\d+$/.test(rawCab)
    ? `CAB ${rawCab}`
    : `CAB ${rawCab.toUpperCase()}`;
  const side: 'Left' | 'Right' =
    args.side && String(args.side).toLowerCase().startsWith('r') ? 'Right' : 'Left';
  const shelf = String(args.shelf || '1')
    .replace(/^(level|lvl|shelf|s)\s*[-:]?\s*/i, '')
    .replace(/^0+(?=\d)/, '') || '1';
  const position = String(args.position || '01').padStart(2, '0');
  const loc = buildStorageLocation({
    building: 'LCSCO',
    room: '204',
    unit: cabCode,
    side,
    shelf,
    position,
  });

  const actionId = `JRV-REG-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  const pendingAction: PendingJarvisAction = {
    actionId,
    actionType: 'REGISTER_CONTAINER',
    createdAt: new Date().toISOString(),
    requestedByUid: user.uid,
    requestedByName: user.fullName,
    requestedByRole: user.role,
    summaryText: `Register new container of ${matchedProd?.chemicalName || args.chemicalName} (${amount} ${unit}) at ${loc.code}`,
    readBackPrompt: `You want to register a new container of ${matchedProd?.chemicalName || args.chemicalName} (${amount} ${unit}) at ${loc.code}. Is that correct?`,
    payload: {
      productId: matchedProd?.productId,
      chemicalName: matchedProd?.chemicalName || args.chemicalName.trim(),
      casNumber: matchedProd?.casNumber || '64-17-5',
      formula: matchedProd?.formula || '—',
      amount,
      unit,
      room: '204',
      cabinet: cabCode,
      side,
      shelf,
      position,
      locationCode: loc.code,
      supplier: args.supplier || 'Sigma-Aldrich',
      lotNumber: args.lotNumber || `LOT-${new Date().getFullYear()}`,
      expiryDate: '2028-12-31',
      reason: 'Registered via JARVIS Voice Assistant',
    },
  };

  return {
    toolResult: {
      status: 'CONFIRMATION_REQUIRED',
      importantInstruction:
        'Read back the new container registration details and ask the user for explicit confirmation.',
      pendingAction,
    },
    cards: [],
    pendingAction,
  };
}

/**
 * STAGE 2 EXECUTION: Executes a user-confirmed PendingJarvisAction on the server
 * with strict RBAC validation and idempotency check.
 */
export function executeConfirmedJarvisActionOnState(
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  pendingAction: PendingJarvisAction,
  executedActionIds: Set<string>
): {
  alreadyExecuted: boolean;
  updatedSnapshot: JarvisInventorySnapshot;
  confirmationMessage: string;
  updatedCard?: JarvisChemicalCard;
} {
  if (executedActionIds.has(pendingAction.actionId)) {
    return {
      alreadyExecuted: true,
      updatedSnapshot: snapshot,
      confirmationMessage: `Action ${pendingAction.actionId} was already completed. Duplicate execution prevented.`,
    };
  }

  const productMap = getProductMap(snapshot.products);

  if (pendingAction.actionType === 'RECORD_CONSUMPTION') {
    assertRolePermission(user.role, PermissionAction.RECORD_CONSUMPTION);
    const target = snapshot.containers.find(
      (c) => c.containerId === pendingAction.payload.containerId
    );
    if (!target) {
      throw new Error(
        `Container "${pendingAction.payload.containerId}" no longer exists in inventory.`
      );
    }

    const calc = calculateWithdrawalMutation(
      target,
      Number(pendingAction.payload.amount),
      pendingAction.payload.unit || target.unit,
      pendingAction.payload.reason
    );

    const updatedContainer: ChemicalContainer = {
      ...target,
      currentQuantity: calc.quantityAfter,
      status: calc.newStatus,
      updatedAt: new Date().toISOString(),
    };

    const tx: InventoryTransaction = {
      transactionId: `WD-${Date.now().toString(36).toUpperCase()}`,
      type: TransactionType.WITHDRAWAL,
      timestamp: new Date().toISOString(),
      userId: user.uid,
      userName: user.fullName,
      userRole: user.role,
      laboratoryId: target.laboratoryId,
      containerId: target.containerId,
      productId: target.productId,
      quantityChange: calc.quantityChange,
      quantityBefore: calc.quantityBefore,
      quantityAfter: calc.quantityAfter,
      unit: target.unit,
      oldLocation: target.location.code,
      newLocation: target.location.code,
      oldStatus: calc.oldStatus,
      newStatus: calc.newStatus,
      reason: `[JARVIS Voice Confirmed] ${pendingAction.payload.reason}`,
    };

    executedActionIds.add(pendingAction.actionId);

    const nextSnapshot: JarvisInventorySnapshot = {
      ...snapshot,
      containers: snapshot.containers.map((c) =>
        c.containerId === target.containerId ? updatedContainer : c
      ),
      transactions: [tx, ...snapshot.transactions],
    };

    return {
      alreadyExecuted: false,
      updatedSnapshot: nextSnapshot,
      confirmationMessage: `Done. Recorded consumption of ${pendingAction.payload.amount} ${target.unit} of ${pendingAction.payload.chemicalName} (${target.containerId}). Remaining stock: ${calc.quantityAfter} ${target.unit}.`,
      updatedCard: buildChemicalCard(
        updatedContainer,
        productMap,
        snapshot.physicalLocations
      ),
    };
  }

  if (pendingAction.actionType === 'CREATE_PURCHASE_REQUEST') {
    assertRolePermission(user.role, PermissionAction.CREATE_PURCHASE_REQUEST);
    const purchaseId = `PUR-${Date.now().toString(36).toUpperCase()}`;
    const newItem: PurchaseWorkflowItem = {
      purchaseId,
      chemicalName: pendingAction.payload.chemicalName,
      casNumber: pendingAction.payload.casNumber || 'N/A',
      formula: pendingAction.payload.formula || 'N/A',
      requestedQuantity: Number(pendingAction.payload.amount || 500),
      unit: pendingAction.payload.unit || ChemicalUnit.GRAM,
      supplier: pendingAction.payload.supplier || 'Sigma-Aldrich',
      laboratoryId: 'LCSCO',
      reason: pendingAction.payload.reason,
      requestedByUid: user.uid,
      requestedByName: user.fullName,
      requestedByRole: user.role,
      requestedAt: new Date().toISOString(),
      status: 'REQUESTED',
      targetPlacementBox: 'A',
    };

    executedActionIds.add(pendingAction.actionId);

    return {
      alreadyExecuted: false,
      updatedSnapshot: {
        ...snapshot,
        purchaseRequests: [newItem, ...snapshot.purchaseRequests],
      },
      confirmationMessage: `Done. Purchase request ${purchaseId} for ${newItem.requestedQuantity} ${newItem.unit} of ${newItem.chemicalName} has been submitted for approval.`,
    };
  }

  if (pendingAction.actionType === 'REPORT_STOCK_RUPTURE') {
    assertRolePermission(user.role, PermissionAction.REPORT_STOCK_RUPTURE);
    const target = snapshot.containers.find(
      (c) => c.containerId === pendingAction.payload.containerId
    );
    if (!target) {
      throw new Error(`Container "${pendingAction.payload.containerId}" not found.`);
    }

    const ruptureId = `RUP-${Date.now().toString(36).toUpperCase()}`;
    const newRupture: StockRuptureRequest = {
      ruptureId,
      containerId: target.containerId,
      productId: target.productId,
      chemicalName: pendingAction.payload.chemicalName,
      casNumber: pendingAction.payload.casNumber || 'N/A',
      formula: pendingAction.payload.formula || 'N/A',
      laboratoryId: target.laboratoryId,
      locationCode: target.location.code,
      currentInventoryQuantity: target.currentQuantity,
      unit: target.unit,
      currentInventoryStatus: ContainerStatus.NEARLY_EMPTY,
      reportedByUid: user.uid,
      reportedByName: user.fullName,
      reportedByRole: user.role,
      reportedAt: new Date().toISOString(),
      comment: pendingAction.payload.reason,
      priority: NotificationPriority.CRITICAL,
      status: StockRuptureStatus.REPORTED,
      reportCount: 1,
      reporters: [
        {
          reporterUid: user.uid,
          reporterName: user.fullName,
          reporterRole: user.role,
          reportedAt: new Date().toISOString(),
          comment: pendingAction.payload.reason,
        },
      ],
    };

    const updatedContainer: ChemicalContainer = {
      ...target,
      status: ContainerStatus.NEARLY_EMPTY,
      updatedAt: new Date().toISOString(),
    };

    executedActionIds.add(pendingAction.actionId);

    return {
      alreadyExecuted: false,
      updatedSnapshot: {
        ...snapshot,
        containers: snapshot.containers.map((c) =>
          c.containerId === target.containerId ? updatedContainer : c
        ),
        stockRuptureRequests: [newRupture, ...snapshot.stockRuptureRequests],
      },
      confirmationMessage: `Done. Stock rupture alert ${ruptureId} for ${pendingAction.payload.chemicalName} (${target.containerId}) has been recorded and sent to the Director and Lab Engineer.`,
      updatedCard: buildChemicalCard(
        updatedContainer,
        productMap,
        snapshot.physicalLocations
      ),
    };
  }

  if (pendingAction.actionType === 'REGISTER_CONTAINER') {
    assertRolePermission(user.role, PermissionAction.ADD_NEW_CHEMICAL);
    const cleanId = sanitizeId(
      pendingAction.payload.containerId ||
        `BOT-${Date.now().toString(36).slice(-4).toUpperCase()}`
    );
    const cab = pendingAction.payload.cabinet || 'A';
    const side = pendingAction.payload.side || 'Left';
    const shelf = pendingAction.payload.shelf || '1';
    const pos = pendingAction.payload.position || '01';
    const loc = buildStorageLocation({
      building: 'LCSCO',
      room: pendingAction.payload.room || '204',
      unit: cab,
      side,
      shelf,
      position: pos,
    });

    const prodId =
      pendingAction.payload.productId ||
      snapshot.products[0]?.productId ||
      'PROD-ETHANOL';
    const qty = Number(pendingAction.payload.amount || 1000);
    const unit = pendingAction.payload.unit || ChemicalUnit.MILLILITER;

    const newBottle: ChemicalContainer = {
      containerId: cleanId,
      productId: prodId,
      laboratoryId: 'LCSCO',
      initialQuantity: qty,
      currentQuantity: qty,
      unit,
      location: loc,
      storageCondition: `Cabinet ${cab}`,
      status: computeStockStatus(qty, qty),
      lotNumber: pendingAction.payload.lotNumber || 'LOT-2026',
      supplier: pendingAction.payload.supplier || 'Sigma-Aldrich',
      expiryDate: pendingAction.payload.expiryDate || '2028-12-31',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user.uid,
    };

    const tx: InventoryTransaction = {
      transactionId: `ADD-${Date.now().toString(36).toUpperCase()}`,
      type: TransactionType.ADDITION,
      timestamp: new Date().toISOString(),
      userId: user.uid,
      userName: user.fullName,
      userRole: user.role,
      laboratoryId: 'LCSCO',
      containerId: cleanId,
      productId: prodId,
      quantityChange: qty,
      quantityBefore: 0,
      quantityAfter: qty,
      unit,
      oldLocation: loc.code,
      newLocation: loc.code,
      oldStatus: ContainerStatus.NORMAL,
      newStatus: ContainerStatus.NORMAL,
      reason: `[JARVIS Voice Confirmed] Initial registration at ${loc.code}`,
    };

    executedActionIds.add(pendingAction.actionId);

    return {
      alreadyExecuted: false,
      updatedSnapshot: {
        ...snapshot,
        containers: [newBottle, ...snapshot.containers],
        transactions: [tx, ...snapshot.transactions],
      },
      confirmationMessage: `Done. Container ${cleanId} (${qty} ${unit} of ${pendingAction.payload.chemicalName}) is now registered at ${loc.code}.`,
      updatedCard: buildChemicalCard(
        newBottle,
        productMap,
        snapshot.physicalLocations
      ),
    };
  }

  throw new Error(`Unsupported action type: ${pendingAction.actionType}`);
}

/**
 * Generates a personalized, role-aware greeting using the authenticated user's actual name and local hour.
 */
export function buildPersonalizedJarvisGreeting(params: {
  user: JarvisUserContext;
  snapshot: JarvisInventorySnapshot;
  localHour: number;
  language: 'en' | 'fr' | 'ar';
}): string {
  const { user, snapshot, localHour, language } = params;
  const rawName = (user.fullName || '').trim();
  const hasRealName = rawName.length > 0 && rawName.toLowerCase() !== 'user';

  const lowStockCount = snapshot.containers.filter(
    (c) =>
      c.status === ContainerStatus.LOW_STOCK ||
      c.status === ContainerStatus.NEARLY_EMPTY
  ).length;
  const pendingPurchases = snapshot.purchaseRequests.filter(
    (p) => p.status === 'REQUESTED'
  ).length;
  const pendingDisposals = snapshot.disposalRequests.filter(
    (d) => d.status === 'REQUESTED'
  ).length;
  const activeRuptures = snapshot.stockRuptureRequests.filter(
    (r) =>
      r.status !== StockRuptureStatus.RESOLVED &&
      r.status !== StockRuptureStatus.REJECTED
  ).length;
  const myPurchases = snapshot.purchaseRequests.filter(
    (p) => p.requestedByUid === user.uid && p.status === 'REQUESTED'
  ).length;

  if (language === 'fr') {
    const salutation =
      localHour >= 5 && localHour < 18 ? 'Bonjour' : 'Bonsoir';
    const namePart = hasRealName ? `, ${rawName}` : '';

    if (user.role === UserRole.ADMIN || user.role === UserRole.PROFESSOR) {
      const totalPending = pendingPurchases + pendingDisposals;
      return `${salutation}${namePart}. Les systèmes du laboratoire LCSCO sont en ligne. Vous avez ${totalPending} demande(s) en attente d'approbation et ${lowStockCount} réactif(s) en stock faible. Comment puis-je vous assister aujourd'hui ?`;
    }
    if (user.role === UserRole.TECHNICIAN) {
      return `${salutation}${namePart}. Les systèmes du laboratoire sont en ligne : ${snapshot.containers.length} contenants actifs, ${activeRuptures} rupture(s) signalée(s) et ${lowStockCount} alerte(s) de stock faible. Que souhaitez-vous vérifier ?`;
    }
    return `${salutation}${namePart}. Les systèmes du laboratoire sont en ligne. Votre tableau de bord d'inventaire est prêt${
      myPurchases > 0 ? ` et vous avez ${myPurchases} demande(s) d'achat en cours` : ''
    }. Comment puis-je vous assister aujourd'hui ?`;
  }

  if (language === 'ar') {
    const salutation =
      localHour >= 5 && localHour < 17 ? 'صباح الخير' : 'مساء الخير';
    const namePart = hasRealName ? ` يا ${rawName}` : '';
    return `${salutation}${namePart}. أنظمة مختبر LCSCO متصلة وجاهزة (${snapshot.containers.length} عبوة نشطة و ${lowStockCount} مواد منخفضة المخزون). كيف يمكنني مساعدتك اليوم؟`;
  }

  // Default English
  const salutation =
    localHour >= 5 && localHour < 12
      ? 'Good morning'
      : localHour >= 12 && localHour < 18
      ? 'Good afternoon'
      : 'Good evening';
  const namePart = hasRealName ? `, ${rawName}` : '';

  if (user.role === UserRole.ADMIN || user.role === UserRole.PROFESSOR) {
    const totalPending = pendingPurchases + pendingDisposals;
    return `${salutation}${namePart}. Laboratory systems are online. You have ${totalPending} pending request(s) and ${lowStockCount} low-stock chemical(s). How can I assist you today?`;
  }
  if (user.role === UserRole.TECHNICIAN) {
    return `${salutation}${namePart}. Laboratory systems are online. We are tracking ${snapshot.containers.length} active containers with ${activeRuptures} stock rupture report(s) and ${lowStockCount} low-stock item(s). How can I assist your operations today?`;
  }
  return `${salutation}${namePart}. Laboratory systems are online. Your inventory dashboard is ready${
    myPurchases > 0 ? ` and you have ${myPurchases} open purchase request(s)` : ''
  }. How can I assist you today?`;
}
