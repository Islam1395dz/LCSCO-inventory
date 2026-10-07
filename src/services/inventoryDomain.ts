/**
 * Pure Domain Logic & RBAC Enforcement (`inventoryDomain.ts`)
 */

import {
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  PermissionAction,
  SCHEMA_CONSTRAINTS,
  StorageLocation,
  UserRole,
} from '../types/inventory';

/**
 * Computes container stock status from currentQuantity and initialQuantity.
 */
export function computeStockStatus(
  currentQuantity: number,
  initialQuantity: number
): ContainerStatus {
  if (initialQuantity <= 0 || currentQuantity < 0) {
    throw new Error('Invalid quantities: initialQuantity must be > 0 and currentQuantity >= 0.');
  }

  const ratio = currentQuantity / initialQuantity;
  if (ratio <= 0.1) {
    return ContainerStatus.NEARLY_EMPTY;
  }
  if (ratio <= 0.25) {
    return ContainerStatus.LOW_STOCK;
  }
  return ContainerStatus.NORMAL;
}

export function isValidEntityId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= SCHEMA_CONSTRAINTS.ID_MAX_LENGTH &&
    SCHEMA_CONSTRAINTS.ID_REGEX.test(id)
  );
}

export function sanitizeId(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SCHEMA_CONSTRAINTS.ID_MAX_LENGTH);
}

/**
 * Generates the standardized physical location code:
 * Room -> Cabinet -> Side -> Shelf -> Position
 * Example:
 *   Room: 204, Cabinet: FLAM-01, Side: Left, Shelf: 2, Position: 01
 *   => R204-FLAM01-L-S02-P01
 */
export function formatPhysicalLocationCode(params: {
  room: string;
  unit: string;
  side?: 'Left' | 'Right' | string;
  shelf: string;
  position: string;
}): string {
  const cleanRoom = (params.room || '204').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || '204';
  const cleanCab = (params.unit || 'FLAM-01').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'FLAM01';
  const sideChar =
    String(params.side || 'Left')
      .trim()
      .toLowerCase()
      .startsWith('r')
      ? 'R'
      : 'L';
  const shelfDigits = String(params.shelf || '1').replace(/[^0-9]/g, '') || '1';
  const shelfPad = shelfDigits.padStart(2, '0');
  const posDigits = String(params.position || '01').replace(/[^0-9]/g, '') || '1';
  const posPad = posDigits.padStart(2, '0');

  return `R${cleanRoom}-${cleanCab}-${sideChar}-S${shelfPad}-P${posPad}`.slice(
    0,
    SCHEMA_CONSTRAINTS.LOCATION_CODE_MAX_LENGTH
  );
}

/**
 * Human-readable summary of a StorageLocation for tables & cards
 * Example: "Room 204 → FLAM-01 → Left → Shelf 2 → Pos 01"
 */
export function formatPhysicalLocationSummary(
  loc: StorageLocation,
  lang: 'en' | 'fr' = 'en'
): string {
  const sideText =
    loc.side === 'Right'
      ? lang === 'fr'
        ? 'Droite'
        : 'Right'
      : lang === 'fr'
      ? 'Gauche'
      : 'Left';
  const shelfNum = String(loc.shelf || '1').replace(/^S/i, '').replace(/^0+/, '') || '1';
  const posNum = String(loc.position || '01').replace(/^P/i, '').padStart(2, '0');
  if (lang === 'fr') {
    return `Salle ${loc.room} → ${loc.unit} → ${sideText} → Étagère ${shelfNum} → Pos ${posNum}`;
  }
  return `Room ${loc.room} → ${loc.unit} → ${sideText} → Shelf ${shelfNum} → Position ${posNum}`;
}

/**
 * Normalizes and validates a physical storage location hierarchy:
 * Room -> Cabinet -> Side (Left/Right) -> Shelf -> Position
 * Note: For strict Firestore rule compatibility (which checks keys `building, room, unit, shelf, position, code`),
 * `toFirestoreLocationMap` strips optional UI fields if writing to Firestore, while `buildStorageLocation`
 * preserves `side` and `cabinetLabel` in-memory and encodes them deterministically in `code`.
 */
export function buildStorageLocation(
  loc: Omit<StorageLocation, 'code'> & { code?: string }
): StorageLocation {
  const building = (loc.building || 'LCSCO')
    .trim()
    .slice(0, SCHEMA_CONSTRAINTS.LOCATION_FIELD_MAX_LENGTH);
  const room = (loc.room || '204')
    .trim()
    .slice(0, SCHEMA_CONSTRAINTS.LOCATION_FIELD_MAX_LENGTH);
  const unit = (loc.unit || 'FLAM-01')
    .trim()
    .toUpperCase()
    .slice(0, SCHEMA_CONSTRAINTS.LOCATION_FIELD_MAX_LENGTH);
  const side: 'Left' | 'Right' =
    loc.side && String(loc.side).toLowerCase().startsWith('r') ? 'Right' : 'Left';
  const rawShelf = String(loc.shelf || '1')
    .trim()
    .replace(/^S/i, '')
    .replace(/^0+/, '') || '1';
  const rawPos = String(loc.position || '01')
    .trim()
    .replace(/^P/i, '')
    .padStart(2, '0');

  const generatedCode = formatPhysicalLocationCode({
    room,
    unit,
    side,
    shelf: rawShelf,
    position: rawPos,
  });

  return {
    building: building || 'LCSCO',
    room: room || '204',
    unit: unit || 'FLAM-01',
    ...(loc.cabinetLabel ? { cabinetLabel: loc.cabinetLabel } : {}),
    side,
    shelf: rawShelf,
    position: rawPos,
    code: (loc.code && loc.code.trim() ? loc.code.trim() : generatedCode).slice(
      0,
      SCHEMA_CONSTRAINTS.LOCATION_CODE_MAX_LENGTH
    ),
  };
}

/**
 * Strips extra optional keys when writing to Firestore so `firestore.rules` (`hasOnly(['building', 'room', 'unit', 'shelf', 'position', 'code'])`) succeeds without error.
 */
export function toFirestoreLocationMap(loc: StorageLocation): {
  building: string;
  room: string;
  unit: string;
  shelf: string;
  position: string;
  code: string;
} {
  return {
    building: loc.building || 'LCSCO',
    room: loc.room || '204',
    unit: loc.unit || 'FLAM-01',
    shelf: String(loc.shelf || '1'),
    position: String(loc.position || '01'),
    code: loc.code,
  };
}

export interface WithdrawalCalculationResult {
  quantityBefore: number;
  quantityAfter: number;
  quantityChange: number;
  oldStatus: ContainerStatus;
  newStatus: ContainerStatus;
}

export function calculateWithdrawalMutation(
  container: Pick<
    ChemicalContainer,
    'currentQuantity' | 'initialQuantity' | 'unit' | 'status'
  >,
  requestedAmount: number,
  requestedUnit: ChemicalUnit,
  reason: string
): WithdrawalCalculationResult {
  if (!reason || reason.trim().length === 0) {
    throw new Error('Validation Error: A reason/experiment note is mandatory.');
  }

  if (requestedUnit !== container.unit) {
    throw new Error(
      `Unit Mismatch Error: Container uses "${container.unit}", but withdrawal requested "${requestedUnit}".`
    );
  }

  if (typeof requestedAmount !== 'number' || isNaN(requestedAmount) || requestedAmount <= 0) {
    throw new Error('Validation Error: Withdrawal amount must be a positive number greater than 0.');
  }

  if (
    container.status === ContainerStatus.NEEDS_IDENTIFICATION ||
    container.status === ContainerStatus.QUARANTINED ||
    container.status === ContainerStatus.DISPOSAL_REQUIRED ||
    container.status === ContainerStatus.EXPIRED
  ) {
    throw new Error(
      `Container Locked Error: Cannot withdraw from a container with status "${container.status}".`
    );
  }

  if (requestedAmount > container.currentQuantity) {
    throw new Error(
      `Negative Stock Error: Requested withdrawal (${requestedAmount} ${requestedUnit}) exceeds available quantity (${container.currentQuantity} ${container.unit}).`
    );
  }

  const quantityBefore = container.currentQuantity;
  const quantityAfter = Math.round((quantityBefore - requestedAmount) * 10000) / 10000;
  const quantityChange = -Math.abs(requestedAmount);
  const newStatus = computeStockStatus(quantityAfter, container.initialQuantity);

  return {
    quantityBefore,
    quantityAfter,
    quantityChange,
    oldStatus: container.status,
    newStatus,
  };
}

export function calculateAdditionMutation(
  container: Pick<
    ChemicalContainer,
    'currentQuantity' | 'initialQuantity' | 'unit' | 'status'
  >,
  addedAmount: number,
  addedUnit: ChemicalUnit,
  reason: string
): WithdrawalCalculationResult {
  if (!reason || reason.trim().length === 0) {
    throw new Error('Validation Error: Reason is mandatory for stock additions.');
  }

  if (addedUnit !== container.unit) {
    throw new Error(
      `Unit Mismatch Error: Container uses "${container.unit}", but addition requested "${addedUnit}".`
    );
  }

  if (typeof addedAmount !== 'number' || isNaN(addedAmount) || addedAmount <= 0) {
    throw new Error('Validation Error: Added amount must be a positive number greater than 0.');
  }

  if (
    container.status === ContainerStatus.QUARANTINED ||
    container.status === ContainerStatus.DISPOSAL_REQUIRED
  ) {
    throw new Error(
      `Container Locked Error: Cannot add stock to a container with status "${container.status}".`
    );
  }

  const quantityBefore = container.currentQuantity;
  const quantityAfter = Math.round((quantityBefore + addedAmount) * 10000) / 10000;
  const effectiveInitial = Math.max(container.initialQuantity, quantityAfter);
  const newStatus = computeStockStatus(quantityAfter, effectiveInitial);

  return {
    quantityBefore,
    quantityAfter,
    quantityChange: Math.abs(addedAmount),
    oldStatus: container.status,
    newStatus,
  };
}

export function calculateCorrectionMutation(
  container: Pick<
    ChemicalContainer,
    'currentQuantity' | 'initialQuantity' | 'unit' | 'status'
  >,
  measuredQuantity: number,
  measuredUnit: ChemicalUnit,
  reason: string
): WithdrawalCalculationResult {
  if (!reason || reason.trim().length === 0) {
    throw new Error(
      'Validation Error: Mandatory audit explanation is required for inventory corrections.'
    );
  }

  if (measuredUnit !== container.unit) {
    throw new Error(
      `Unit Mismatch Error: Container uses "${container.unit}", but measurement provided "${measuredUnit}".`
    );
  }

  if (typeof measuredQuantity !== 'number' || isNaN(measuredQuantity) || measuredQuantity < 0) {
    throw new Error('Negative Stock Error: Measured physical quantity cannot be negative.');
  }

  if (container.status === ContainerStatus.DISPOSAL_REQUIRED) {
    throw new Error('Container Locked Error: Cannot adjust a container marked for disposal.');
  }

  const quantityBefore = container.currentQuantity;
  const quantityAfter = Math.round(measuredQuantity * 10000) / 10000;
  const quantityChange = Math.round((quantityAfter - quantityBefore) * 10000) / 10000;

  const effectiveInitial = Math.max(container.initialQuantity, quantityAfter);
  const newStatus =
    container.status === ContainerStatus.NEEDS_IDENTIFICATION ||
    container.status === ContainerStatus.QUARANTINED
      ? container.status
      : computeStockStatus(quantityAfter, effectiveInitial);

  return {
    quantityBefore,
    quantityAfter,
    quantityChange,
    oldStatus: container.status,
    newStatus,
  };
}

/**
 * Role-Based Access Control (RBAC) Matrix for the 4 Laboratory Roles:
 * 1. DIRECTOR (`UserRole.ADMIN`) — Full Administrator
 * 2. PROFESSOR (`UserRole.PROFESSOR`) — Supervisor / Research Group Manager
 * 3. LAB ENGINEER (`UserRole.TECHNICIAN`) — Operational Inventory Manager
 * 4. PHD STUDENT (`UserRole.STUDENT_RESEARCHER` / `UserRole.PHD_STUDENT`) — Researcher / Inventory User
 */
const ROLE_PERMISSIONS_MAP: Record<UserRole, Set<PermissionAction>> = {
  [UserRole.ADMIN]: new Set(Object.values(PermissionAction)),
  [UserRole.PROFESSOR]: new Set([
    PermissionAction.VIEW_INVENTORY,
    PermissionAction.SEARCH_AND_FILTER,
    PermissionAction.VIEW_CHEMICAL_DETAILS_AND_SDS,
    PermissionAction.ADD_NEW_CHEMICAL,
    PermissionAction.EDIT_CHEMICAL_INFO,
    PermissionAction.RECORD_CONSUMPTION,
    PermissionAction.SUBMIT_STOCK_ADJUSTMENT,
    PermissionAction.CREATE_DISPOSAL_REQUEST,
    PermissionAction.APPROVE_DISPOSAL_REQUEST,
    PermissionAction.CREATE_PURCHASE_REQUEST,
    PermissionAction.APPROVE_PURCHASE_REQUEST,
    PermissionAction.REPORT_DAMAGED_OR_EXPIRED,
    PermissionAction.REPORT_STOCK_RUPTURE,
    PermissionAction.EXPORT_REPORTS,
  ]),
  [UserRole.TECHNICIAN]: new Set([
    PermissionAction.VIEW_INVENTORY,
    PermissionAction.SEARCH_AND_FILTER,
    PermissionAction.VIEW_CHEMICAL_DETAILS_AND_SDS,
    PermissionAction.ADD_NEW_CHEMICAL,
    PermissionAction.EDIT_CHEMICAL_INFO,
    PermissionAction.MANAGE_STORAGE_LOCATIONS,
    PermissionAction.RECORD_CONSUMPTION,
    PermissionAction.RECORD_STOCK_ADDITION,
    PermissionAction.MOVE_BETWEEN_LOCATIONS,
    PermissionAction.SUBMIT_STOCK_ADJUSTMENT,
    PermissionAction.APPROVE_STOCK_ADJUSTMENT,
    PermissionAction.CREATE_DISPOSAL_REQUEST,
    PermissionAction.RECORD_APPROVED_DISPOSAL,
    PermissionAction.CREATE_PURCHASE_REQUEST,
    PermissionAction.RECEIVE_VALIDATED_DELIVERY,
    PermissionAction.REPORT_DAMAGED_OR_EXPIRED,
    PermissionAction.REPORT_STOCK_RUPTURE,
    PermissionAction.REVIEW_STOCK_RUPTURE,
    PermissionAction.EXPORT_REPORTS,
    PermissionAction.ARCHIVE_REMOVE_CHEMICAL,
  ]),
  [UserRole.STUDENT_RESEARCHER]: new Set([
    PermissionAction.VIEW_INVENTORY,
    PermissionAction.SEARCH_AND_FILTER,
    PermissionAction.VIEW_CHEMICAL_DETAILS_AND_SDS,
    PermissionAction.RECORD_CONSUMPTION,
    PermissionAction.CREATE_DISPOSAL_REQUEST,
    PermissionAction.CREATE_PURCHASE_REQUEST,
    PermissionAction.REPORT_DAMAGED_OR_EXPIRED,
    PermissionAction.REPORT_STOCK_RUPTURE,
  ]),
  [UserRole.GUEST]: new Set([
    PermissionAction.VIEW_INVENTORY,
    PermissionAction.SEARCH_AND_FILTER,
  ]),
};

export function hasRolePermission(
  role: UserRole | undefined | null,
  action: PermissionAction
): boolean {
  if (!role) return false;
  const set = ROLE_PERMISSIONS_MAP[role];
  return Boolean(set && set.has(action));
}

export function assertRolePermission(
  role: UserRole | undefined | null,
  action: PermissionAction,
  customMessage?: string
): void {
  if (!hasRolePermission(role, action)) {
    throw new Error(
      customMessage ||
        `Permission Denied: Role "${role || 'UNKNOWN'}" is not authorized to perform "${action}".`
    );
  }
}
