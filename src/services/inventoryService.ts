/**
 * Production Inventory Service (`inventoryService.ts`)
 * Implements atomic Firestore `runTransaction` workflows for stock withdrawals, additions,
 * inventory discrepancy corrections, identification/quarantine flagging, and catalog management.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import {
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  Laboratory,
  OperationType,
  Product,
  SCHEMA_CONSTRAINTS,
  StorageLocation,
  TransactionType,
  UserRole,
  UserStatus,
} from '../types/inventory';
import {
  assertRolePermission,
  buildStorageLocation,
  calculateAdditionMutation,
  calculateCorrectionMutation,
  calculateWithdrawalMutation,
  computeStockStatus,
  isValidEntityId,
  sanitizeId,
  toFirestoreLocationMap,
} from './inventoryDomain';
import { PermissionAction } from '../types/inventory';

export interface TransactionActor {
  uid: string;
  fullName: string;
  role: UserRole;
}

function generateTransactionId(prefix = 'TX'): string {
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${randomSuffix}`;
}

/**
 * WORKFLOW A: Atomic Bench Withdrawal (`runTransaction`)
 * 1. Reads current container stock inside transaction
 * 2. Validates unit match, operational lock status, and requestedAmount <= currentQuantity
 * 3. Automatically computes NORMAL / LOW_STOCK / NEARLY_EMPTY status
 * 4. Updates container and appends immutable Transaction record atomically
 */
export async function withdrawChemicalStock(params: {
  containerId: string;
  amount: number;
  unit: ChemicalUnit;
  reason: string;
  actor: TransactionActor;
}): Promise<{ newQuantity: number; newStatus: ContainerStatus; transactionId: string }> {
  const { containerId, amount, unit, reason, actor } = params;
  assertRolePermission(actor.role, PermissionAction.RECORD_CONSUMPTION);
  if (!isValidEntityId(containerId)) {
    throw new Error('Invalid container ID format.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('WD');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const calc = calculateWithdrawalMutation(container, amount, unit, reason);

      transaction.update(containerRef, {
        currentQuantity: calc.quantityAfter,
        status: calc.newStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.WITHDRAWAL,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
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
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return {
        newQuantity: calc.quantityAfter,
        newStatus: calc.newStatus,
        transactionId,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Negative Stock Error') ||
        error.message.includes('Unit Mismatch Error') ||
        error.message.includes('Container Locked Error') ||
        error.message.includes('Validation Error') ||
        error.message.includes('does not exist'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * Atomic Stock Addition (`runTransaction`)
 */
export async function addChemicalStock(params: {
  containerId: string;
  amount: number;
  unit: ChemicalUnit;
  reason: string;
  actor: TransactionActor;
}): Promise<{ newQuantity: number; newStatus: ContainerStatus; transactionId: string }> {
  const { containerId, amount, unit, reason, actor } = params;
  assertRolePermission(
    actor.role,
    PermissionAction.RECORD_STOCK_ADDITION,
    'Only the Director or Technician can record stock additions.'
  );
  if (!isValidEntityId(containerId)) {
    throw new Error('Invalid container ID format.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('ADD');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const calc = calculateAdditionMutation(container, amount, unit, reason);

      transaction.update(containerRef, {
        currentQuantity: calc.quantityAfter,
        status: calc.newStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.ADDITION,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
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
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return {
        newQuantity: calc.quantityAfter,
        newStatus: calc.newStatus,
        transactionId,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Unit Mismatch Error') ||
        error.message.includes('Container Locked Error') ||
        error.message.includes('Validation Error') ||
        error.message.includes('does not exist'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * WORKFLOW B (Part 1): Flag Container for Identification Problem or Quarantine
 * Locks the container from routine withdrawals and places it on the Professor / Lab Director Dashboard.
 */
export async function flagContainerIssue(params: {
  containerId: string;
  targetStatus: ContainerStatus.NEEDS_IDENTIFICATION | ContainerStatus.QUARANTINED;
  reason: string;
  actor: TransactionActor;
}): Promise<{ transactionId: string }> {
  const { containerId, targetStatus, reason, actor } = params;
  if (!reason || reason.trim().length === 0) {
    throw new Error('Validation Error: Please describe the label/identification or contamination issue.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('FLG');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      if (container.status === ContainerStatus.DISPOSAL_REQUIRED) {
        throw new Error('Container Locked Error: Container is already marked for disposal.');
      }

      transaction.update(containerRef, {
        status: targetStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.STATUS_CHANGE,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
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
        newStatus: targetStatus,
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return { transactionId };
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Validation Error') || error.message.includes('Container Locked Error'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * WORKFLOW B (Part 2): Professor / Lab Director Resolution of Flagged Container
 */
export async function resolveFlaggedContainer(params: {
  containerId: string;
  resolution: 'RESTORE' | 'DISPOSAL';
  reason: string;
  actor: TransactionActor;
}): Promise<{ newStatus: ContainerStatus; transactionId: string }> {
  const { containerId, resolution, reason, actor } = params;
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.PROFESSOR) {
    throw new Error('Permission Denied: Only a Lab Director or Professor can resolve identification/quarantine flags.');
  }
  if (!reason || reason.trim().length === 0) {
    throw new Error('Validation Error: Mandatory review note is required to resolve container status.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('RES');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const newStatus =
        resolution === 'DISPOSAL'
          ? ContainerStatus.DISPOSAL_REQUIRED
          : computeStockStatus(container.currentQuantity, container.initialQuantity);

      transaction.update(containerRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.STATUS_CHANGE,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
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
        newStatus,
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return { newStatus, transactionId };
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Permission Denied') || error.message.includes('Validation Error'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * WORKFLOW C: Lab Engineer / Technician Inventory Check & Discrepancy Correction (`runTransaction`)
 */
export async function correctContainerInventory(params: {
  containerId: string;
  measuredQuantity: number;
  unit: ChemicalUnit;
  reason: string;
  actor: TransactionActor;
}): Promise<{ quantityBefore: number; quantityAfter: number; quantityChange: number; transactionId: string }> {
  const { containerId, measuredQuantity, unit, reason, actor } = params;
  if (
    actor.role !== UserRole.ADMIN &&
    actor.role !== UserRole.PROFESSOR &&
    actor.role !== UserRole.TECHNICIAN
  ) {
    throw new Error('Permission Denied: Only Lab Engineers/Technicians, Professors, or the Lab Director can log physical stock corrections.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('COR');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const calc = calculateCorrectionMutation(container, measuredQuantity, unit, reason);

      transaction.update(containerRef, {
        currentQuantity: calc.quantityAfter,
        status: calc.newStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.CORRECTION,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
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
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return {
        quantityBefore: calc.quantityBefore,
        quantityAfter: calc.quantityAfter,
        quantityChange: calc.quantityChange,
        transactionId,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Permission Denied') ||
        error.message.includes('Negative Stock Error') ||
        error.message.includes('Unit Mismatch Error') ||
        error.message.includes('Container Locked Error') ||
        error.message.includes('Validation Error'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * Location Transfer (`runTransaction`)
 */
export async function transferContainerLocation(params: {
  containerId: string;
  newLocationInput: Omit<StorageLocation, 'code'> & { code?: string };
  newLaboratoryId?: string;
  newStorageCondition?: string;
  reason: string;
  actor: TransactionActor;
}): Promise<{ newLocationCode: string; transactionId: string }> {
  const { containerId, newLocationInput, newLaboratoryId, newStorageCondition, reason, actor } = params;
  assertRolePermission(
    actor.role,
    PermissionAction.MOVE_BETWEEN_LOCATIONS,
    'Only the Director or Technician can move chemicals between storage locations.'
  );
  if (!reason || reason.trim().length === 0) {
    throw new Error('Validation Error: Reason is required for location transfer.');
  }

  const validatedLocation = buildStorageLocation(newLocationInput);
  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('TRF');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const targetLabId = newLaboratoryId ? sanitizeId(newLaboratoryId) : container.laboratoryId;
      const targetCondition = newStorageCondition
        ? newStorageCondition.trim().slice(0, SCHEMA_CONSTRAINTS.STORAGE_REQ_MAX_LENGTH)
        : container.storageCondition;

      transaction.update(containerRef, {
        location: toFirestoreLocationMap(validatedLocation),
        laboratoryId: targetLabId,
        storageCondition: targetCondition,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.TRANSFER,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: targetLabId,
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
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return { newLocationCode: validatedLocation.code, transactionId };
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Permission Denied') || error.message.includes('Validation Error'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * Create a new Catalog Product
 */
export async function createProductCatalogItem(input: {
  productId?: string;
  chemicalName: string;
  casNumber: string;
  formula: string;
  molecularWeight: number;
  hazardClass: string[];
  storageRequirements: string;
  defaultUnit: ChemicalUnit;
  minimumStock: number;
  reorderLevel: number;
  sdsUrl: string;
}): Promise<string> {
  const productId = input.productId
    ? sanitizeId(input.productId)
    : `PROD-${Date.now().toString(36).toUpperCase()}`;

  const payload = {
    productId,
    chemicalName: input.chemicalName.trim().slice(0, SCHEMA_CONSTRAINTS.CHEMICAL_NAME_MAX_LENGTH),
    casNumber: input.casNumber.trim().slice(0, SCHEMA_CONSTRAINTS.CAS_MAX_LENGTH),
    formula: input.formula.trim().slice(0, SCHEMA_CONSTRAINTS.FORMULA_MAX_LENGTH),
    molecularWeight: Math.max(0, Number(input.molecularWeight) || 0),
    hazardClass: input.hazardClass
      .map((h) => h.trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, SCHEMA_CONSTRAINTS.MAX_HAZARD_CLASSES),
    storageRequirements: input.storageRequirements.trim().slice(0, SCHEMA_CONSTRAINTS.STORAGE_REQ_MAX_LENGTH),
    defaultUnit: input.defaultUnit,
    minimumStock: Math.max(0, Number(input.minimumStock) || 0),
    reorderLevel: Math.max(0, Number(input.reorderLevel) || 0),
    sdsUrl: (input.sdsUrl || 'https://pubchem.ncbi.nlm.nih.gov').trim().slice(0, SCHEMA_CONSTRAINTS.SDS_URL_MAX_LENGTH),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'products', productId), payload);
    return productId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `products/${productId}`);
  }
}

/**
 * Register a new Physical Container (`runTransaction`)
 */
export async function createChemicalContainer(input: {
  containerId: string;
  productId: string;
  laboratoryId: string;
  initialQuantity: number;
  currentQuantity?: number;
  unit: ChemicalUnit;
  location: Omit<StorageLocation, 'code'> & { code?: string };
  storageCondition: string;
  lotNumber: string;
  supplier: string;
  expiryDate: string;
  actor: TransactionActor;
}): Promise<string> {
  const containerId = sanitizeId(input.containerId.toUpperCase());
  if (!isValidEntityId(containerId)) {
    throw new Error('Validation Error: Container ID must use alphanumeric characters or hyphens (e.g., SOL-001).');
  }

  const initialQty = Number(input.initialQuantity);
  const currentQty = input.currentQuantity !== undefined ? Number(input.currentQuantity) : initialQty;
  if (initialQty <= 0 || currentQty < 0) {
    throw new Error('Validation Error: Initial quantity must be > 0 and current quantity >= 0.');
  }

  const validatedLocation = buildStorageLocation(input.location);
  const computedStatus = computeStockStatus(currentQty, initialQty);
  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('REG');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    await runTransaction(db, async (transaction) => {
      const existingSnap = await transaction.get(containerRef);
      if (existingSnap.exists()) {
        throw new Error(`Duplicate Container ID: A container with ID "${containerId}" already exists.`);
      }

      transaction.set(containerRef, {
        containerId,
        productId: sanitizeId(input.productId),
        laboratoryId: sanitizeId(input.laboratoryId),
        initialQuantity: initialQty,
        currentQuantity: currentQty,
        unit: input.unit,
        location: toFirestoreLocationMap(validatedLocation),
        storageCondition: input.storageCondition.trim().slice(0, SCHEMA_CONSTRAINTS.STORAGE_REQ_MAX_LENGTH),
        status: computedStatus,
        lotNumber: input.lotNumber.trim().slice(0, SCHEMA_CONSTRAINTS.LOT_NUMBER_MAX_LENGTH),
        supplier: input.supplier.trim().slice(0, SCHEMA_CONSTRAINTS.SUPPLIER_MAX_LENGTH),
        expiryDate: input.expiryDate.trim().slice(0, SCHEMA_CONSTRAINTS.EXPIRY_DATE_MAX_LENGTH),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: input.actor.uid,
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.ADDITION,
        timestamp: serverTimestamp(),
        userId: input.actor.uid,
        userName: input.actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: sanitizeId(input.laboratoryId),
        containerId,
        productId: sanitizeId(input.productId),
        quantityChange: currentQty,
        quantityBefore: 0,
        quantityAfter: currentQty,
        unit: input.unit,
        oldLocation: validatedLocation.code,
        newLocation: validatedLocation.code,
        oldStatus: computedStatus,
        newStatus: computedStatus,
        reason: `Initial container registration (Lot: ${input.lotNumber.trim()})`,
      });
    });

    return containerId;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Duplicate Container ID') || error.message.includes('Validation Error'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `containers/${containerId}`);
  }
}

/**
 * Archive / Permanently Delete Physical Container (Strictly Restricted to DIRECTOR ONLY)
 * Professors, Technicians, and PhD Students are explicitly blocked from permanently deleting inventory records.
 */
export async function deleteChemicalContainer(params: {
  containerId: string;
  actor: TransactionActor;
}): Promise<void> {
  const { containerId, actor } = params;
  assertRolePermission(
    actor.role,
    PermissionAction.ARCHIVE_REMOVE_CHEMICAL,
    'Only the Director can archive or permanently remove chemical records.'
  );
  try {
    await deleteDoc(doc(db, 'containers', containerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `containers/${containerId}`);
  }
}

/**
 * Create a new Laboratory
 */
export async function createLaboratory(input: { labId: string; name: string }): Promise<string> {
  const labId = sanitizeId(input.labId.toUpperCase());
  const name = input.name.trim().slice(0, SCHEMA_CONSTRAINTS.LAB_NAME_MAX_LENGTH);
  if (!isValidEntityId(labId) || !name) {
    throw new Error('Validation Error: Valid Lab ID and Name are required.');
  }

  try {
    await setDoc(doc(db, 'laboratories', labId), {
      labId,
      name,
      createdAt: serverTimestamp(),
    });
    return labId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `laboratories/${labId}`);
  }
}

/**
 * Lab Director ONLY: Provision a new Researcher Profile in Firestore
 */
export async function createLabMemberProfile(input: {
  uid?: string;
  fullName: string;
  email: string;
  role: UserRole;
  laboratoryIds: string[];
  status?: UserStatus;
  actor: TransactionActor;
}): Promise<string> {
  if (input.actor.role !== UserRole.ADMIN) {
    throw new Error('Permission Denied: Only the Director profile has access to add or remove profiles.');
  }

  const uid = input.uid
    ? sanitizeId(input.uid)
    : `LCSCO-${Date.now().toString(36).toUpperCase()}`;

  const payload = {
    uid,
    fullName: input.fullName.trim().slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
    email: input.email.trim().slice(0, SCHEMA_CONSTRAINTS.EMAIL_MAX_LENGTH),
    role: input.role,
    laboratoryIds: input.laboratoryIds.slice(0, SCHEMA_CONSTRAINTS.MAX_LAB_IDS),
    status: input.status || UserStatus.ACTIVE,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid), payload);
    return uid;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
  }
}

/**
 * Lab Director ONLY: Remove a Researcher Profile from Firestore
 */
export async function deleteLabMemberProfile(params: {
  targetUid: string;
  actor: TransactionActor;
}): Promise<void> {
  if (params.actor.role !== UserRole.ADMIN) {
    throw new Error('Permission Denied: Only the Director profile has access to add or remove profiles.');
  }
  try {
    await deleteDoc(doc(db, 'users', params.targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${params.targetUid}`);
  }
}

/**
 * Update own profile details (Full Name & Assigned LCSCO Research Teams)
 */
export async function updateOwnUserProfile(params: {
  uid: string;
  fullName: string;
  laboratoryIds: string[];
}): Promise<void> {
  const { uid, fullName, laboratoryIds } = params;
  try {
    await updateDoc(doc(db, 'users', uid), {
      fullName: fullName.trim().slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
      laboratoryIds: laboratoryIds.slice(0, SCHEMA_CONSTRAINTS.MAX_LAB_IDS),
      lastLogin: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

/**
 * Lab Director / Professor: Update a user's Role, Status, or Laboratory assignments
 */
export async function updateUserPermissions(params: {
  targetUid: string;
  role: UserRole;
  status: UserStatus;
  laboratoryIds: string[];
}): Promise<void> {
  const { targetUid, role, status, laboratoryIds } = params;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      role,
      status,
      laboratoryIds: laboratoryIds.slice(0, SCHEMA_CONSTRAINTS.MAX_LAB_IDS),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }
}

/**
 * Deletes all non-temporary user accounts in Firestore and seeds the 4 clean temporary accounts:
 * 1. Director (`temp-director`)
 * 2. Technician (`temp-technician`)
 * 3. Professor (`temp-professor`)
 * 4. PhD Student (`temp-phd-student`)
 */
export async function resetToFourTemporaryAccounts(currentAuthUid?: string): Promise<void> {
  try {
    const existingUsersSnap = await getDocs(collection(db, 'users'));
    const obsoleteDemoIds = new Set([
      'temp-technician',
      'temp-professor',
      'temp-phd-student',
    ]);

    for (const userDoc of existingUsersSnap.docs) {
      if (obsoleteDemoIds.has(userDoc.id) && userDoc.id !== currentAuthUid) {
        await deleteDoc(doc(db, 'users', userDoc.id));
      }
    }

    // Ensure only the single LCSCO laboratory exists in Firestore
    const existingLabsSnap = await getDocs(collection(db, 'laboratories'));
    for (const labDoc of existingLabsSnap.docs) {
      if (labDoc.id !== 'LCSCO') {
        await deleteDoc(doc(db, 'laboratories', labDoc.id));
      }
    }
    await setDoc(doc(db, 'laboratories', 'LCSCO'), {
      labId: 'LCSCO',
      name: 'LCSCO — Laboratoire de Catalyse et Synthèse en Chimie Organique',
      createdAt: serverTimestamp(),
    });

    const tempAccounts: Array<{
      uid: string;
      fullName: string;
      email: string;
      role: UserRole;
      laboratoryIds: string[];
    }> = [
      {
        uid: 'temp-director',
        fullName: 'Director',
        email: 'director@lcsco.dz',
        role: UserRole.ADMIN,
        laboratoryIds: ['LCSCO'],
      },
    ];

    for (const acc of tempAccounts) {
      await setDoc(doc(db, 'users', acc.uid), {
        uid: acc.uid,
        fullName: acc.fullName,
        email: acc.email,
        role: acc.role,
        laboratoryIds: acc.laboratoryIds,
        status: UserStatus.ACTIVE,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'users/resetToFourTemporaryAccounts');
  }
}

/**
 * Seeds realistic LCSCO (Laboratoire de Catalyse et Synthèse en Chimie Organique) data
 */
export async function seedInitialLabInventory(actor: TransactionActor): Promise<void> {
  try {
    const existingProducts = await getDocs(collection(db, 'products'));
    if (!existingProducts.empty) {
      return;
    }

    // 1. Create the single LCSCO Laboratory
    await setDoc(doc(db, 'laboratories', 'LCSCO'), {
      labId: 'LCSCO',
      name: 'LCSCO — Laboratoire de Catalyse et Synthèse en Chimie Organique',
      createdAt: serverTimestamp(),
    });

    // 2. Create Chemical Catalog Products
    const products: Array<Omit<Product, 'createdAt' | 'updatedAt'>> = [
      {
        productId: 'PROD-ACETONE',
        chemicalName: 'Acetone (HPLC Plus Grade, >=99.9%)',
        casNumber: '67-64-1',
        formula: 'C3H6O',
        molecularWeight: 58.08,
        hazardClass: ['GHS02 Flammable', 'GHS07 Irritant'],
        storageRequirements: 'Flammable Cabinet (15-25°C)',
        defaultUnit: ChemicalUnit.MILLILITER,
        minimumStock: 1000,
        reorderLevel: 2500,
        sdsUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/Acetone',
      },
      {
        productId: 'PROD-DCM',
        chemicalName: 'Dichloromethane (Anhydrous, >=99.8%)',
        casNumber: '75-09-2',
        formula: 'CH2Cl2',
        molecularWeight: 84.93,
        hazardClass: ['GHS08 Health Hazard', 'GHS07 Irritant'],
        storageRequirements: 'Ventilated Halogenated Solvent Cabinet',
        defaultUnit: ChemicalUnit.MILLILITER,
        minimumStock: 500,
        reorderLevel: 1500,
        sdsUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/Dichloromethane',
      },
      {
        productId: 'PROD-NABH4',
        chemicalName: 'Sodium Borohydride (ReagentPlus, 99%)',
        casNumber: '16940-66-2',
        formula: 'NaBH4',
        molecularWeight: 37.83,
        hazardClass: ['GHS02 Water-Reactive', 'GHS05 Corrosive', 'GHS06 Acute Toxic'],
        storageRequirements: 'Desiccator Cabinet (Dry Nitrogen Purge)',
        defaultUnit: ChemicalUnit.GRAM,
        minimumStock: 100,
        reorderLevel: 250,
        sdsUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/Sodium-borohydride',
      },
      {
        productId: 'PROD-HCL',
        chemicalName: 'Hydrochloric Acid (ACS Reagent, 37%)',
        casNumber: '7647-01-0',
        formula: 'HCl',
        molecularWeight: 36.46,
        hazardClass: ['GHS05 Corrosive', 'GHS07 Acute Toxic'],
        storageRequirements: 'Polyethylene Acid Corrosives Cabinet',
        defaultUnit: ChemicalUnit.MILLILITER,
        minimumStock: 500,
        reorderLevel: 1000,
        sdsUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/Hydrochloric-acid',
      },
      {
        productId: 'PROD-PD-C',
        chemicalName: 'Palladium on Carbon (10 wt.% loading, matrix activated)',
        casNumber: '7440-05-3',
        formula: 'Pd/C',
        molecularWeight: 106.42,
        hazardClass: ['GHS02 Pyrophoric Solid', 'GHS07 Irritant'],
        storageRequirements: 'Inert Argon Glovebox / Fireproof Safe',
        defaultUnit: ChemicalUnit.GRAM,
        minimumStock: 10,
        reorderLevel: 25,
        sdsUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/Palladium',
      },
    ];

    for (const p of products) {
      await setDoc(doc(db, 'products', p.productId), {
        ...p,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 3. Create Physical Containers
    const sampleContainers = [
      {
        containerId: 'SOL-001',
        productId: 'PROD-ACETONE',
        laboratoryId: 'LCSCO',
        initialQuantity: 2500,
        currentQuantity: 1850,
        unit: ChemicalUnit.MILLILITER,
        location: toFirestoreLocationMap(
          buildStorageLocation({
            building: 'LCSCO',
            room: '204',
            unit: 'A',
            side: 'Left',
            shelf: '1',
            position: '01',
          })
        ),
        storageCondition: 'Cabinet A — Flammable Solvents (20°C Verified)',
        status: ContainerStatus.NORMAL,
        lotNumber: 'SHBP4821V',
        supplier: 'Sigma-Aldrich',
        expiryDate: '2028-06-30',
      },
      {
        containerId: 'SOL-002',
        productId: 'PROD-DCM',
        laboratoryId: 'LCSCO',
        initialQuantity: 1000,
        currentQuantity: 180,
        unit: ChemicalUnit.MILLILITER,
        location: toFirestoreLocationMap(
          buildStorageLocation({
            building: 'LCSCO',
            room: '204',
            unit: 'B',
            side: 'Left',
            shelf: '1',
            position: '02',
          })
        ),
        storageCondition: 'Cabinet B — Halogenated Solvent Cabinet',
        status: ContainerStatus.LOW_STOCK,
        lotNumber: 'MKCR9910A',
        supplier: 'Merck Millipore',
        expiryDate: '2027-11-15',
      },
      {
        containerId: 'REA-104',
        productId: 'PROD-NABH4',
        laboratoryId: 'LCSCO',
        initialQuantity: 500,
        currentQuantity: 35,
        unit: ChemicalUnit.GRAM,
        location: toFirestoreLocationMap(
          buildStorageLocation({
            building: 'LCSCO',
            room: '204',
            unit: 'F',
            side: 'Left',
            shelf: '1',
            position: '02',
          })
        ),
        storageCondition: 'Cabinet F — Dry N2 Desiccator (RH < 5%)',
        status: ContainerStatus.NEARLY_EMPTY,
        lotNumber: 'STBK1102',
        supplier: 'Thermo Scientific',
        expiryDate: '2026-10-25',
      },
      {
        containerId: 'ACD-201',
        productId: 'PROD-HCL',
        laboratoryId: 'LCSCO',
        initialQuantity: 2500,
        currentQuantity: 1420,
        unit: ChemicalUnit.MILLILITER,
        location: toFirestoreLocationMap(
          buildStorageLocation({
            building: 'LCSCO',
            room: '204',
            unit: 'C',
            side: 'Left',
            shelf: '1',
            position: '01',
          })
        ),
        storageCondition: 'Cabinet C — Corrosive Acids Cabinet',
        status: ContainerStatus.NEEDS_IDENTIFICATION,
        lotNumber: 'ALDR-7731',
        supplier: 'Fisher Chemical',
        expiryDate: '2027-04-01',
      },
      {
        containerId: 'CAT-309',
        productId: 'PROD-PD-C',
        laboratoryId: 'LCSCO',
        initialQuantity: 50,
        currentQuantity: 42.5,
        unit: ChemicalUnit.GRAM,
        location: toFirestoreLocationMap(
          buildStorageLocation({
            building: 'LCSCO',
            room: '204',
            unit: 'I',
            side: 'Left',
            shelf: '1',
            position: '01',
          })
        ),
        storageCondition: 'Cabinet I — Inert Argon Glovebox (< 0.5 ppm O2)',
        status: ContainerStatus.NORMAL,
        lotNumber: 'ALFA-90182',
        supplier: 'Alfa Aesar',
        expiryDate: '2028-01-15',
      },
    ];

    for (const c of sampleContainers) {
      await setDoc(doc(db, 'containers', c.containerId), {
        ...c,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor.uid,
      });

      const txId = generateTransactionId('SEED');
      await setDoc(doc(db, 'transactions', txId), {
        transactionId: txId,
        type:
          c.status === ContainerStatus.NEEDS_IDENTIFICATION
            ? TransactionType.STATUS_CHANGE
            : TransactionType.ADDITION,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: c.laboratoryId,
        containerId: c.containerId,
        productId: c.productId,
        quantityChange: c.currentQuantity,
        quantityBefore: 0,
        quantityAfter: c.currentQuantity,
        unit: c.unit,
        oldLocation: c.location.code,
        newLocation: c.location.code,
        oldStatus: ContainerStatus.NORMAL,
        newStatus: c.status,
        reason:
          c.status === ContainerStatus.NEEDS_IDENTIFICATION
            ? 'Acid vapor corroded outer thermal barcode; flagged for Professor / Lab Director verification.'
            : `Initial LCSCO inventory registration (Lot ${c.lotNumber})`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedInitialLabInventory');
  }
}
