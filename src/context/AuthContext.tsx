import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, parseDisplayError } from '../firebase';
import {
  AppNotification,
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  DisposalWorkflowItem,
  InventoryTransaction,
  LabFloorPlanConfig,
  Laboratory,
  NotificationPriority,
  NotificationType,
  OperationType,
  PermissionAction,
  PhysicalLocationConfig,
  Product,
  PurchaseWorkflowItem,
  SCHEMA_CONSTRAINTS,
  StockAdjustmentReasonType,
  StockAdjustmentRequest,
  StockRuptureRequest,
  StockRuptureStatus,
  TransactionType,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types/inventory';
import {
  assertRolePermission,
  buildStorageLocation,
  calculateCorrectionMutation,
  computeStockStatus,
  hasRolePermission,
} from '../services/inventoryDomain';
import {
  resetToFourTemporaryAccounts,
  seedInitialLabInventory,
} from '../services/inventoryService';
import {
  buildNotificationsForRecipients,
  CreateRoleNotificationParams,
  markAllUserNotificationsReadInList,
  markNotificationReadInList,
  processStockRuptureReport,
  resolveNotificationsByRequestId,
  transitionStockRuptureWorkflow,
} from '../services/notificationService';
import {
  INITIAL_DEMO_ADJUSTMENTS,
  INITIAL_DEMO_CONTAINERS,
  INITIAL_DEMO_DISPOSALS,
  INITIAL_DEMO_NOTIFICATIONS,
  INITIAL_DEMO_PRODUCTS,
  INITIAL_DEMO_PURCHASES,
  INITIAL_DEMO_RUPTURES,
  INITIAL_DEMO_TRANSACTIONS,
  INITIAL_PHYSICAL_LOCATIONS,
} from '../data/demoInventoryData';

const BOOTSTRAPPED_ADMIN_EMAIL = 'islam.hasnaoui13@gmail.com';

export interface TemporaryAccountSpec {
  uid: string;
  fullName: string;
  email: string;
  accessCode: string;
  role: UserRole;
  badge: string;
  summary: string;
  laboratoryIds: string[];
}

/**
 * The 4 Official User Roles & Accounts:
 * 1. DIRECTOR — Full Administrator (`UserRole.ADMIN`)
 * 2. PROFESSOR — Supervisor / Research Group Manager (`UserRole.PROFESSOR`)
 * 3. LAB ENGINEER — Operational Inventory Manager (`UserRole.TECHNICIAN`)
 * 4. PHD STUDENT — Researcher / Inventory User (`UserRole.STUDENT_RESEARCHER` / `UserRole.PHD_STUDENT`)
 */
export const TEMPORARY_LCSCO_ACCOUNTS: TemporaryAccountSpec[] = [
  {
    uid: 'temp-director',
    fullName: 'Director',
    email: 'director@lcsco.dz',
    accessCode: 'LCSCO2026',
    role: UserRole.ADMIN,
    badge: '1. DIRECTOR — Full Administrator',
    summary:
      'Full access to inventory, physical storage locations, stock movements, controlled quantity adjustments & approvals, disposal/purchase approvals, user & role governance, audit logs, and system settings.',
    laboratoryIds: ['LCSCO'],
  },
];

export const INITIAL_TEMPORARY_USERS: UserProfile[] = TEMPORARY_LCSCO_ACCOUNTS.map((acc) => ({
  uid: acc.uid,
  fullName: acc.fullName,
  email: acc.email,
  password: acc.accessCode,
  role: acc.role,
  laboratoryIds: ['LCSCO'],
  status: UserStatus.ACTIVE,
  createdAt: '2026-10-06T08:00:00Z',
  lastLogin: '2026-10-06T08:00:00Z',
}));

const SHARED_STORAGE_KEY = 'lcsco_shared_inventory_state_v9';

const INITIAL_PREVIEW_LABS: Laboratory[] = [
  {
    labId: 'LCSCO',
    name: 'LCSCO — Laboratoire de Catalyse et Synthèse en Chimie Organique',
    createdAt: '2026-10-01T08:00:00Z',
  },
];

interface AuthAndInventoryContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  isPreviewMode: boolean;
  enterPreviewMode: () => void;
  exitPreviewMode: () => void;
  loginWithTemporaryAccount: (roleOrUid: UserRole | string) => void;
  resetAccountsToFourTemporary: () => Promise<void>;
  authReady: boolean;
  dataLoading: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  switchMyRoleForTesting: (newRole: UserRole) => Promise<void>;
  // Real-time Collections
  laboratories: Laboratory[];
  products: Product[];
  containers: ChemicalContainer[];
  transactions: InventoryTransaction[];
  allUsers: UserProfile[];
  adjustmentRequests: StockAdjustmentRequest[];
  disposalRequests: DisposalWorkflowItem[];
  purchaseRequests: PurchaseWorkflowItem[];
  stockRuptureRequests: StockRuptureRequest[];
  notifications: AppNotification[];
  myNotifications: AppNotification[];
  unreadNotificationCount: number;
  physicalLocations: PhysicalLocationConfig[];
  labFloorPlanConfig: LabFloorPlanConfig;
  updateLabFloorPlanConfig: (config: Partial<LabFloorPlanConfig>) => void;
  // Preview Mode State Mutators
  updatePreviewState: (updater: {
    containers?: ChemicalContainer[];
    transactions?: InventoryTransaction[];
    products?: Product[];
    laboratories?: Laboratory[];
    users?: UserProfile[];
    adjustmentRequests?: StockAdjustmentRequest[];
    disposalRequests?: DisposalWorkflowItem[];
    purchaseRequests?: PurchaseWorkflowItem[];
    stockRuptureRequests?: StockRuptureRequest[];
    notifications?: AppNotification[];
    physicalLocations?: PhysicalLocationConfig[];
    labFloorPlanConfig?: LabFloorPlanConfig;
    currentProfile?: Partial<UserProfile>;
  }) => void;
  // Physical Locations Management (Room -> Cabinet -> Side -> Shelf -> Position)
  savePhysicalLocation: (config: PhysicalLocationConfig, previousCabinetCode?: string, previousRoom?: string) => void;
  deletePhysicalLocation: (id: string) => void;
  renameShelfInCabinet: (params: {
    cabinetId: string;
    oldShelf: string;
    newShelf: string;
  }) => void;
  deleteShelfFromCabinet: (params: {
    cabinetId: string;
    shelf: string;
  }) => void;
  // Comprehensive Edit & Delete of Any Reagent / Solvent / Salt / Container & Product
  updateContainerAndProduct: (params: {
    containerId: string;
    newContainerId?: string;
    chemicalName: string;
    casNumber: string;
    formula: string;
    molecularWeight: number;
    chemicalClassification: string;
    storageClassification: string;
    hazardClass: string[];
    minimumStock: number;
    reorderLevel: number;
    sdsUrl: string;
    initialQuantity: number;
    currentQuantity: number;
    unit: ChemicalUnit;
    lotNumber: string;
    supplier: string;
    expiryDate: string;
    room: string;
    cabinet: string;
    cabinetLabel?: string;
    side: 'Left' | 'Right';
    shelf: string;
    position: string;
    status?: ContainerStatus;
  }) => void;
  deleteContainerById: (containerId: string) => void;
  // Demo Data Management
  resetDemoInventory: () => void;
  clearDemoInventory: () => void;
  // Controlled Quantity Adjustment by Director and Lab Engineer
  adjustContainerQuantityDirectly: (params: {
    containerId: string;
    newQuantity: number;
    adjustmentType: StockAdjustmentReasonType;
    comment?: string;
  }) => void;
  // Reusable Notification & Stock Rupture API
  sendRoleNotification: (params: CreateRoleNotificationParams) => void;
  markNotificationAsRead: (notificationId: string) => void;
  markAllNotificationsAsRead: () => void;
  reportStockRupture: (params: {
    containerId: string;
    priority: NotificationPriority;
    comment?: string;
  }) => { ruptureRequest: StockRuptureRequest; wasMergedDuplicate: boolean };
  updateStockRuptureStatus: (params: {
    ruptureId: string;
    nextStatus: StockRuptureStatus;
    resolutionNote?: string;
  }) => void;
  // Enforced Workflow Actions (UI + Action-level RBAC)
  canPerform: (action: PermissionAction) => boolean;
  submitStockAdjustmentRequest: (params: {
    containerId: string;
    measuredQuantity: number;
    unit: ChemicalUnit;
    reason: string;
    adjustmentType?: StockAdjustmentReasonType;
  }) => void;
  approveStockAdjustmentRequest: (requestId: string, approve: boolean) => void;
  createDisposalRequest: (params: {
    containerId: string;
    reason: string;
  }) => void;
  approveDisposalRequest: (disposalId: string, approve: boolean) => void;
  recordPhysicalDisposal: (disposalId: string, wasteManifestCode?: string) => void;
  createPurchaseRequest: (params: {
    chemicalName: string;
    casNumber: string;
    formula: string;
    requestedQuantity: number;
    unit: ChemicalUnit;
    supplier: string;
    reason: string;
    targetPlacementBox?: string;
  }) => void;
  approveOrOrderPurchaseRequest: (
    purchaseId: string,
    nextStage: 'APPROVED' | 'ORDERED'
  ) => void;
  receivePurchaseOrderIntoInventory: (params: {
    purchaseId: string;
    newContainerId: string;
    lotNumber: string;
    expiryDate: string;
    placementBox: string;
    room: string;
    side?: 'Left' | 'Right';
    shelf?: string;
    position?: string;
  }) => void;
  // RBAC Computed Permissions
  isAdmin: boolean; // 1. DIRECTOR
  isProfessor: boolean; // 2. PROFESSOR
  isTechnician: boolean; // 3. LAB ENGINEER
  isPhdStudent: boolean; // 4. PHD STUDENT
  isAdminOrProf: boolean;
  isTechOrAbove: boolean;
  isActiveLabMember: boolean;
}

const AuthAndInventoryContext = createContext<AuthAndInventoryContextValue | undefined>(undefined);

export const AuthAndInventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [previewProfile, setPreviewProfile] = useState<UserProfile>(INITIAL_TEMPORARY_USERS[0]);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadInitialCachedState = () => {
    try {
      const raw = localStorage.getItem(SHARED_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  };

  const cachedState = loadInitialCachedState();

  const [laboratories, setLaboratories] = useState<Laboratory[]>(
    cachedState?.laboratories || INITIAL_PREVIEW_LABS
  );
  const [products, setProducts] = useState<Product[]>(
    cachedState?.products || INITIAL_DEMO_PRODUCTS
  );
  const [containers, setContainers] = useState<ChemicalContainer[]>(
    cachedState?.containers || INITIAL_DEMO_CONTAINERS
  );
  const [transactions, setTransactions] = useState<InventoryTransaction[]>(
    cachedState?.transactions || INITIAL_DEMO_TRANSACTIONS
  );
  const [allUsers, setAllUsers] = useState<UserProfile[]>(
    cachedState?.users || INITIAL_TEMPORARY_USERS
  );
  const [adjustmentRequests, setAdjustmentRequests] = useState<StockAdjustmentRequest[]>(
    cachedState?.adjustmentRequests || INITIAL_DEMO_ADJUSTMENTS
  );
  const [disposalRequests, setDisposalRequests] = useState<DisposalWorkflowItem[]>(
    cachedState?.disposalRequests || INITIAL_DEMO_DISPOSALS
  );
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseWorkflowItem[]>(
    cachedState?.purchaseRequests || INITIAL_DEMO_PURCHASES
  );
  const [stockRuptureRequests, setStockRuptureRequests] = useState<StockRuptureRequest[]>(
    cachedState?.stockRuptureRequests || INITIAL_DEMO_RUPTURES
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(
    cachedState?.notifications || INITIAL_DEMO_NOTIFICATIONS
  );
  const [physicalLocations, setPhysicalLocations] = useState<PhysicalLocationConfig[]>(
    cachedState?.physicalLocations || INITIAL_PHYSICAL_LOCATIONS
  );
  const [labFloorPlanConfig, setLabFloorPlanConfig] = useState<LabFloorPlanConfig>(
    cachedState?.labFloorPlanConfig || {
      backgroundImageDataUrl: null,
      layoutPreset: 'exact_user_plan',
      showArchitecturalOverlay: true,
    }
  );

  // Cross-Tab & Multi-Session Real-Time Synchronization
  useEffect(() => {
    let lastSeenVersion = 0;

    const applySharedData = (data: any) => {
      if (!data) return;
      if (Array.isArray(data.containers) && data.containers.length > 0) {
        // Only apply server state if it uses the new R204-... location format or has physicalLocations
        const firstCode = data.containers[0]?.location?.code || '';
        if (firstCode.startsWith('R') || Array.isArray(data.physicalLocations)) {
          setContainers(data.containers);
          if (Array.isArray(data.transactions)) setTransactions(data.transactions);
          if (Array.isArray(data.products)) setProducts(data.products);
          if (Array.isArray(data.laboratories)) setLaboratories(data.laboratories);
          if (Array.isArray(data.adjustmentRequests))
            setAdjustmentRequests(data.adjustmentRequests);
          if (Array.isArray(data.disposalRequests)) setDisposalRequests(data.disposalRequests);
          if (Array.isArray(data.purchaseRequests)) setPurchaseRequests(data.purchaseRequests);
          if (Array.isArray(data.stockRuptureRequests))
            setStockRuptureRequests(data.stockRuptureRequests);
          if (Array.isArray(data.notifications)) setNotifications(data.notifications);
          if (Array.isArray(data.physicalLocations)) setPhysicalLocations(data.physicalLocations);
          if (data.labFloorPlanConfig) setLabFloorPlanConfig(data.labFloorPlanConfig);
          if (Array.isArray(data.users)) {
            setAllUsers(data.users);
            setPreviewProfile((prev) => {
              const updatedMe = data.users.find((u: UserProfile) => u.uid === prev.uid);
              return updatedMe ? { ...prev, ...updatedMe } : prev;
            });
          }
        }
      }
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === SHARED_STORAGE_KEY && e.newValue && !firebaseUser) {
        try {
          const parsed = JSON.parse(e.newValue);
          applySharedData(parsed);
        } catch {
          // Ignore parse error
        }
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    const syncWithServer = async () => {
      if (firebaseUser) return;
      try {
        const res = await fetch('/api/shared-state');
        if (!res.ok) return;
        const serverState = await res.json();
        const serverFirstCode = serverState?.containers?.[0]?.location?.code || '';
        const hasObsoletePreseededUsers =
          Array.isArray(serverState?.users) &&
          serverState.users.some((u: any) =>
            ['temp-professor', 'temp-technician', 'temp-phd-student'].includes(u.uid)
          );
        const hasTenCabinets =
          Array.isArray(serverState?.physicalLocations) &&
          serverState.physicalLocations.length >= 10;
        const isServerMigrated =
          (serverFirstCode.startsWith('R') || Array.isArray(serverState?.physicalLocations)) &&
          !hasObsoletePreseededUsers &&
          hasTenCabinets;

        if (serverState && serverState.version > lastSeenVersion && isServerMigrated) {
          lastSeenVersion = serverState.version;
          applySharedData(serverState);
          try {
            localStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(serverState));
          } catch {
            // Ignore quota errors
          }
        } else if (serverState && (!isServerMigrated || serverState.version === 0)) {
          const seedPayload = cachedState || {
            containers: INITIAL_DEMO_CONTAINERS,
            transactions: INITIAL_DEMO_TRANSACTIONS,
            products: INITIAL_DEMO_PRODUCTS,
            laboratories: INITIAL_PREVIEW_LABS,
            users: INITIAL_TEMPORARY_USERS,
            adjustmentRequests: INITIAL_DEMO_ADJUSTMENTS,
            disposalRequests: INITIAL_DEMO_DISPOSALS,
            purchaseRequests: INITIAL_DEMO_PURCHASES,
            stockRuptureRequests: INITIAL_DEMO_RUPTURES,
            notifications: INITIAL_DEMO_NOTIFICATIONS,
            physicalLocations: INITIAL_PHYSICAL_LOCATIONS,
          };
          await fetch('/api/shared-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(seedPayload),
          });
        }
      } catch {
        // Ignore network errors
      }
    };

    syncWithServer();
    const intervalId = window.setInterval(syncWithServer, 2500);

    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      window.clearInterval(intervalId);
    };
  }, [firebaseUser]);

  // 1. Auth Listener & Profile Bootstrap
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      setIsPreviewMode(false);

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        const isBootstrapped = user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

        if (!snap.exists()) {
          const initialRole = isBootstrapped ? UserRole.ADMIN : UserRole.PHD_STUDENT;
          const defaultName =
            initialRole === UserRole.ADMIN
              ? 'Director'
              : initialRole === UserRole.TECHNICIAN
              ? 'Lab Engineer'
              : initialRole === UserRole.PROFESSOR
              ? 'Professor'
              : 'PhD Student';

          const newProfileData = {
            uid: user.uid,
            fullName: defaultName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
            email: (user.email || 'director@lcsco.dz').slice(
              0,
              SCHEMA_CONSTRAINTS.EMAIL_MAX_LENGTH
            ),
            role: initialRole,
            laboratoryIds: ['LCSCO'],
            status: UserStatus.ACTIVE,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
          };
          await setDoc(userRef, newProfileData);

          if (isBootstrapped) {
            await seedInitialLabInventory({
              uid: user.uid,
              fullName: newProfileData.fullName,
              role: initialRole,
            });
            await resetToFourTemporaryAccounts(user.uid);
          }
        } else {
          const existingData = snap.data() as UserProfile;
          await updateDoc(userRef, {
            lastLogin: serverTimestamp(),
          });

          if (
            isBootstrapped ||
            existingData.role === UserRole.ADMIN ||
            existingData.role === UserRole.PROFESSOR ||
            existingData.role === UserRole.TECHNICIAN
          ) {
            await seedInitialLabInventory({
              uid: user.uid,
              fullName: existingData.fullName,
              role: existingData.role,
            });
          }
          if (isBootstrapped || existingData.role === UserRole.ADMIN) {
            await resetToFourTemporaryAccounts(user.uid);
          }
        }
      } catch (err) {
        setError(parseDisplayError(err));
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Real-time Listener for Current User Profile
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const userRef = doc(db, 'users', firebaseUser.uid);
    const unsubProfile = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        } catch (formattedErr) {
          setError(parseDisplayError(formattedErr));
        }
      }
    );
    return () => unsubProfile();
  }, [authReady, firebaseUser]);

  // 3. Real-time Listeners for Inventory Collections
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile) return;
    setDataLoading(true);

    const labsQuery = query(collection(db, 'laboratories'), where('name', '>=', ''));
    const productsQuery = query(collection(db, 'products'), where('molecularWeight', '>=', 0));
    const containersQuery = query(collection(db, 'containers'), where('currentQuantity', '>=', 0));
    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('quantityBefore', '>=', 0)
    );

    const unsubLabs = onSnapshot(
      labsQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Laboratory);
        setLaboratories(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'laboratories');
        } catch (e) {
          setError(parseDisplayError(e));
        }
      }
    );

    const unsubProducts = onSnapshot(
      productsQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Product);
        setProducts(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'products');
        } catch (e) {
          setError(parseDisplayError(e));
        }
      }
    );

    const unsubContainers = onSnapshot(
      containersQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ChemicalContainer);
        list.sort((a, b) => a.containerId.localeCompare(b.containerId));
        setContainers(list);
        setDataLoading(false);
      },
      (err) => {
        setDataLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'containers');
        } catch (e) {
          setError(parseDisplayError(e));
        }
      }
    );

    const unsubTransactions = onSnapshot(
      transactionsQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as InventoryTransaction);
        list.sort((a, b) => {
          const timeA =
            a.timestamp && typeof (a.timestamp as any).toMillis === 'function'
              ? (a.timestamp as any).toMillis()
              : 0;
          const timeB =
            b.timestamp && typeof (b.timestamp as any).toMillis === 'function'
              ? (b.timestamp as any).toMillis()
              : 0;
          return timeB - timeA;
        });
        setTransactions(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'transactions');
        } catch (e) {
          setError(parseDisplayError(e));
        }
      }
    );

    return () => {
      unsubLabs();
      unsubProducts();
      unsubContainers();
      unsubTransactions();
    };
  }, [authReady, firebaseUser, profile?.uid]);

  const effectiveProfile: UserProfile | null =
    profile || (isPreviewMode ? previewProfile : null);

  const isBootstrapped =
    firebaseUser?.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const isAdmin = Boolean(effectiveProfile?.role === UserRole.ADMIN || isBootstrapped);
  const isProfessor = Boolean(effectiveProfile?.role === UserRole.PROFESSOR);
  const isTechnician = Boolean(effectiveProfile?.role === UserRole.TECHNICIAN);
  const isPhdStudent = Boolean(effectiveProfile?.role === UserRole.PHD_STUDENT);
  const isAdminOrProf = Boolean(isAdmin || isProfessor);
  const isTechOrAbove = Boolean(isAdminOrProf || isTechnician);
  const isActiveLabMember = Boolean(
    effectiveProfile &&
      effectiveProfile.status !== UserStatus.DEACTIVATED &&
      (isTechOrAbove || isPhdStudent)
  );

  const canPerform = (action: PermissionAction): boolean => {
    if (!effectiveProfile || effectiveProfile.status === UserStatus.DEACTIVATED) return false;
    return hasRolePermission(effectiveProfile.role, action);
  };

  const myNotifications = useMemo(() => {
    if (!effectiveProfile) return [];
    const canonicalRoleUser = INITIAL_TEMPORARY_USERS.find(
      (u) => u.role === effectiveProfile.role
    );
    const matchingIds = new Set<string>([effectiveProfile.uid]);
    if (canonicalRoleUser) {
      matchingIds.add(canonicalRoleUser.uid);
    }
    return notifications
      .filter((n) => matchingIds.has(n.recipientUserId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications, effectiveProfile?.uid, effectiveProfile?.role]);

  const unreadNotificationCount = useMemo(() => {
    return myNotifications.filter((n) => !n.isRead).length;
  }, [myNotifications]);

  // 4. Real-time Users Collection Listener
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile) return;
    if (!isAdminOrProf) {
      setAllUsers(INITIAL_TEMPORARY_USERS);
      return;
    }

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserProfile);
        setAllUsers(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'users');
        } catch (e) {
          setError(parseDisplayError(e));
        }
      }
    );

    return () => unsubUsers();
  }, [authReady, firebaseUser, profile?.uid, isAdminOrProf]);

  const persistSharedState = (nextState: {
    containers: ChemicalContainer[];
    transactions: InventoryTransaction[];
    products: Product[];
    laboratories: Laboratory[];
    users: UserProfile[];
    adjustmentRequests: StockAdjustmentRequest[];
    disposalRequests: DisposalWorkflowItem[];
    purchaseRequests: PurchaseWorkflowItem[];
    stockRuptureRequests: StockRuptureRequest[];
    notifications: AppNotification[];
    physicalLocations: PhysicalLocationConfig[];
  }) => {
    try {
      localStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // Ignore quota errors
    }
    fetch('/api/shared-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextState),
    }).catch(() => {
      // Ignore offline errors
    });
  };

  const loginWithTemporaryAccount = (roleOrUid: UserRole | string) => {
    setError(null);
    const normalizedInput = String(roleOrUid).toLowerCase().trim();
    const isLabEngineerAlias =
      normalizedInput === 'technician@lcsco.dz' ||
      normalizedInput === 'lab.engineer@lcsco.dz' ||
      normalizedInput === 'lab engineer' ||
      normalizedInput === 'technician';

    const matched =
      allUsers.find(
        (u) =>
          u.role === roleOrUid ||
          u.uid === roleOrUid ||
          u.email.toLowerCase() === normalizedInput ||
          u.fullName.toLowerCase() === normalizedInput ||
          (isLabEngineerAlias && u.role === UserRole.TECHNICIAN)
      ) ||
      INITIAL_TEMPORARY_USERS.find(
        (u) =>
          u.role === roleOrUid ||
          u.uid === roleOrUid ||
          u.email.toLowerCase() === normalizedInput ||
          (isLabEngineerAlias && u.role === UserRole.TECHNICIAN)
      ) ||
      allUsers[0] ||
      INITIAL_TEMPORARY_USERS[0];

    if (matched.status === UserStatus.DEACTIVATED) {
      setError('Account Deactivated: Please contact the Laboratory Director.');
      return;
    }

    setPreviewProfile(matched);
    setIsPreviewMode(true);
  };

  const resetAccountsToFourTemporary = async () => {
    setError(null);
    setAllUsers(INITIAL_TEMPORARY_USERS);
    const currentRole = effectiveProfile?.role || UserRole.ADMIN;
    const matched =
      INITIAL_TEMPORARY_USERS.find((u) => u.role === currentRole) || INITIAL_TEMPORARY_USERS[0];
    setPreviewProfile(matched);
    persistSharedState({
      containers,
      transactions,
      products,
      laboratories,
      users: INITIAL_TEMPORARY_USERS,
      adjustmentRequests,
      disposalRequests,
      purchaseRequests,
      stockRuptureRequests,
      notifications,
      physicalLocations,
    });
    if (firebaseUser) {
      await resetToFourTemporaryAccounts(firebaseUser.uid);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(parseDisplayError(err));
    }
  };

  const signOut = async () => {
    setError(null);
    if (firebaseUser) {
      try {
        await firebaseSignOut(auth);
      } catch (err) {
        setError(parseDisplayError(err));
      }
    }
    setIsPreviewMode(false);
  };

  const switchMyRoleForTesting = async (newRole: UserRole) => {
    setError(null);
    const matchingPersona =
      allUsers.find((u) => u.role === newRole) ||
      INITIAL_TEMPORARY_USERS.find((u) => u.role === newRole) ||
      INITIAL_TEMPORARY_USERS[0];
    if (firebaseUser && profile) {
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          role: newRole,
          fullName: matchingPersona.fullName,
          lastLogin: serverTimestamp(),
        });
      } catch (err) {
        setError(parseDisplayError(err));
      }
    } else if (isPreviewMode) {
      setPreviewProfile(matchingPersona);
    }
  };

  const updatePreviewState = (updater: {
    containers?: ChemicalContainer[];
    transactions?: InventoryTransaction[];
    products?: Product[];
    laboratories?: Laboratory[];
    users?: UserProfile[];
    adjustmentRequests?: StockAdjustmentRequest[];
    disposalRequests?: DisposalWorkflowItem[];
    purchaseRequests?: PurchaseWorkflowItem[];
    stockRuptureRequests?: StockRuptureRequest[];
    notifications?: AppNotification[];
    physicalLocations?: PhysicalLocationConfig[];
    labFloorPlanConfig?: LabFloorPlanConfig;
    currentProfile?: Partial<UserProfile>;
  }) => {
    const nextContainers = updater.containers ?? containers;
    const nextTransactions = updater.transactions ?? transactions;
    const nextProducts = updater.products ?? products;
    const nextLaboratories = updater.laboratories ?? laboratories;
    const nextAdjustmentRequests = updater.adjustmentRequests ?? adjustmentRequests;
    const nextDisposalRequests = updater.disposalRequests ?? disposalRequests;
    const nextPurchaseRequests = updater.purchaseRequests ?? purchaseRequests;
    const nextStockRuptureRequests = updater.stockRuptureRequests ?? stockRuptureRequests;
    const nextNotifications = updater.notifications ?? notifications;
    const nextPhysicalLocations = updater.physicalLocations ?? physicalLocations;
    const nextLabFloorPlanConfig = updater.labFloorPlanConfig ?? labFloorPlanConfig;
    let nextUsers = updater.users ?? allUsers;

    if (updater.containers) setContainers(nextContainers);
    if (updater.transactions) setTransactions(nextTransactions);
    if (updater.products) setProducts(nextProducts);
    if (updater.laboratories) setLaboratories(nextLaboratories);
    if (updater.adjustmentRequests) setAdjustmentRequests(nextAdjustmentRequests);
    if (updater.disposalRequests) setDisposalRequests(nextDisposalRequests);
    if (updater.purchaseRequests) setPurchaseRequests(nextPurchaseRequests);
    if (updater.stockRuptureRequests) setStockRuptureRequests(nextStockRuptureRequests);
    if (updater.notifications) setNotifications(nextNotifications);
    if (updater.physicalLocations) setPhysicalLocations(nextPhysicalLocations);
    if (updater.labFloorPlanConfig) setLabFloorPlanConfig(nextLabFloorPlanConfig);

    if (updater.currentProfile) {
      const updatedProfile: UserProfile = {
        ...previewProfile,
        ...updater.currentProfile,
      };
      setPreviewProfile(updatedProfile);
      nextUsers = nextUsers.map((u) => (u.uid === updatedProfile.uid ? updatedProfile : u));
    }

    if (updater.users || updater.currentProfile) {
      setAllUsers(nextUsers);
    }

    persistSharedState({
      containers: nextContainers,
      transactions: nextTransactions,
      products: nextProducts,
      laboratories: nextLaboratories,
      users: nextUsers,
      adjustmentRequests: nextAdjustmentRequests,
      disposalRequests: nextDisposalRequests,
      purchaseRequests: nextPurchaseRequests,
      stockRuptureRequests: nextStockRuptureRequests,
      notifications: nextNotifications,
      physicalLocations: nextPhysicalLocations,
      labFloorPlanConfig: nextLabFloorPlanConfig,
    });
  };

  const updateLabFloorPlanConfig = (partialConfig: Partial<LabFloorPlanConfig>) => {
    const merged: LabFloorPlanConfig = {
      ...labFloorPlanConfig,
      ...partialConfig,
      updatedAt: new Date().toISOString(),
    };
    updatePreviewState({ labFloorPlanConfig: merged });
  };

  /**
   * Physical Locations Management (Room -> Cabinet -> Side -> Shelf -> Position)
   * Cascades cabinet code / cabinet label / room edits to all containers inside that cabinet.
   */
  const savePhysicalLocation = (
    config: PhysicalLocationConfig,
    previousCabinetCode?: string,
    previousRoom?: string
  ) => {
    const existing = physicalLocations.find((p) => p.id === config.id);
    const oldCab = previousCabinetCode || existing?.cabinet;
    const oldRm = previousRoom || existing?.room;

    const existingIdx = physicalLocations.findIndex((p) => p.id === config.id);
    const nextList =
      existingIdx >= 0
        ? physicalLocations.map((p) => (p.id === config.id ? config : p))
        : [...physicalLocations, config];

    // Cascade cabinet code / room / cabinetLabel changes to containers stored in this cabinet
    const updatedContainers =
      oldCab
        ? containers.map((c) => {
            const matchesCab =
              c.location.unit.toUpperCase() === oldCab.toUpperCase() &&
              (!oldRm || c.location.room === oldRm);
            if (!matchesCab) return c;
            const rebuiltLoc = buildStorageLocation({
              building: c.location.building || 'LCSCO',
              room: config.room,
              unit: config.cabinet,
              cabinetLabel: config.cabinetLabel,
              side: c.location.side || 'Left',
              shelf: c.location.shelf,
              position: c.location.position,
            });
            return {
              ...c,
              location: rebuiltLoc,
              storageCondition: `${config.cabinetLabel} — ${config.storageClassification}`,
              storageClassification: config.storageClassification,
              updatedAt: new Date().toISOString(),
            };
          })
        : containers;

    updatePreviewState({
      physicalLocations: nextList,
      containers: updatedContainers,
    });
  };

  const deletePhysicalLocation = (id: string) => {
    const nextList = physicalLocations.filter((p) => p.id !== id);
    updatePreviewState({ physicalLocations: nextList });
  };

  const renameShelfInCabinet = (params: {
    cabinetId: string;
    oldShelf: string;
    newShelf: string;
  }) => {
    const cab = physicalLocations.find((p) => p.id === params.cabinetId);
    if (!cab) return;
    const cleanOld = params.oldShelf.trim();
    const cleanNew = params.newShelf.trim();
    if (!cleanNew || cleanOld === cleanNew) return;

    const updatedShelves = cab.shelves.map((s) => (s === cleanOld ? cleanNew : s));
    const uniqueShelves = Array.from(new Set(updatedShelves));

    const updatedLocations = physicalLocations.map((p) =>
      p.id === cab.id ? { ...p, shelves: uniqueShelves } : p
    );

    const updatedContainers = containers.map((c) => {
      if (
        c.location.unit.toUpperCase() === cab.cabinet.toUpperCase() &&
        c.location.room === cab.room &&
        String(c.location.shelf) === cleanOld
      ) {
        const nextLoc = buildStorageLocation({
          building: c.location.building || 'LCSCO',
          room: cab.room,
          unit: cab.cabinet,
          cabinetLabel: cab.cabinetLabel,
          side: c.location.side || 'Left',
          shelf: cleanNew,
          position: c.location.position,
        });
        return {
          ...c,
          location: nextLoc,
          updatedAt: new Date().toISOString(),
        };
      }
      return c;
    });

    updatePreviewState({
      physicalLocations: updatedLocations,
      containers: updatedContainers,
    });
  };

  const deleteShelfFromCabinet = (params: { cabinetId: string; shelf: string }) => {
    const cab = physicalLocations.find((p) => p.id === params.cabinetId);
    if (!cab) return;
    const cleanShelf = params.shelf.trim();
    const updatedShelves = cab.shelves.filter((s) => s !== cleanShelf);
    if (updatedShelves.length === 0) {
      throw new Error('A cabinet must have at least one shelf.');
    }
    const updatedLocations = physicalLocations.map((p) =>
      p.id === cab.id ? { ...p, shelves: updatedShelves } : p
    );
    updatePreviewState({ physicalLocations: updatedLocations });
  };

  /**
   * Comprehensive Edit of any Reagent / Solvent / Salt / Chemical Container & Product
   * Accessible to Director and Lab Engineer (and Professor if authorized).
   */
  const updateContainerAndProduct = (params: {
    containerId: string;
    newContainerId?: string;
    chemicalName: string;
    casNumber: string;
    formula: string;
    molecularWeight: number;
    chemicalClassification: string;
    storageClassification: string;
    hazardClass: string[];
    minimumStock: number;
    reorderLevel: number;
    sdsUrl: string;
    initialQuantity: number;
    currentQuantity: number;
    unit: ChemicalUnit;
    lotNumber: string;
    supplier: string;
    expiryDate: string;
    room: string;
    cabinet: string;
    cabinetLabel?: string;
    side: 'Left' | 'Right';
    shelf: string;
    position: string;
    status?: ContainerStatus;
  }) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.EDIT_CHEMICAL_INFO,
      'Only the Director, Lab Engineer, or Professor can edit chemical records.'
    );

    const existingContainer = containers.find((c) => c.containerId === params.containerId);
    if (!existingContainer) {
      throw new Error(`Container ${params.containerId} not found.`);
    }

    const finalContainerId = (params.newContainerId || params.containerId)
      .trim()
      .toUpperCase();
    if (
      finalContainerId !== params.containerId &&
      containers.some((c) => c.containerId === finalContainerId)
    ) {
      throw new Error(`A container with ID "${finalContainerId}" already exists.`);
    }

    const matchedCab = physicalLocations.find(
      (p) => p.room === params.room && p.cabinet === params.cabinet
    ) || physicalLocations.find((p) => p.cabinet === params.cabinet);

    const nextLoc = buildStorageLocation({
      building: existingContainer.location.building || 'LCSCO',
      room: params.room,
      unit: params.cabinet,
      cabinetLabel:
        params.cabinetLabel ||
        matchedCab?.cabinetLabel ||
        existingContainer.location.cabinetLabel ||
        'Storage Cabinet',
      side: params.side,
      shelf: params.shelf,
      position: params.position,
    });

    const nextInitQty = Math.max(
      0.001,
      Number(params.initialQuantity) || existingContainer.initialQuantity,
      Number(params.currentQuantity) || 0
    );
    const nextCurrQty = Math.max(0, Number(params.currentQuantity));
    const computedStatus =
      params.status || computeStockStatus(nextCurrQty, nextInitQty);

    const updatedProducts = products.map((p) =>
      p.productId === existingContainer.productId
        ? {
            ...p,
            chemicalName: params.chemicalName.trim() || p.chemicalName,
            casNumber: params.casNumber.trim() || p.casNumber,
            formula: params.formula.trim() || p.formula,
            molecularWeight: Number(params.molecularWeight) || p.molecularWeight,
            chemicalClassification: (params.chemicalClassification ||
              p.chemicalClassification ||
              'Solvents') as Product['chemicalClassification'],
            storageClassification: (params.storageClassification ||
              p.storageClassification ||
              'Flammable solvent') as Product['storageClassification'],
            hazardClass:
              params.hazardClass && params.hazardClass.length > 0
                ? params.hazardClass
                : p.hazardClass,
            minimumStock: Number(params.minimumStock) >= 0 ? Number(params.minimumStock) : p.minimumStock,
            reorderLevel: Number(params.reorderLevel) >= 0 ? Number(params.reorderLevel) : p.reorderLevel,
            defaultUnit: params.unit,
            sdsUrl: params.sdsUrl.trim() || p.sdsUrl,
            updatedAt: new Date().toISOString(),
          }
        : p
    );

    const updatedContainers = containers.map((c) =>
      c.containerId === params.containerId
        ? {
            ...c,
            containerId: finalContainerId,
            initialQuantity: nextInitQty,
            currentQuantity: nextCurrQty,
            unit: params.unit,
            lotNumber: params.lotNumber.trim() || c.lotNumber,
            supplier: params.supplier.trim() || c.supplier,
            expiryDate: params.expiryDate.trim() || c.expiryDate,
            location: nextLoc,
            storageCondition: `${nextLoc.cabinetLabel || 'Storage Cabinet'} — ${params.storageClassification}`,
            chemicalClassification: params.chemicalClassification as ChemicalContainer['chemicalClassification'],
            storageClassification: params.storageClassification as ChemicalContainer['storageClassification'],
            status: computedStatus,
            updatedAt: new Date().toISOString(),
          }
        : c
    );

    const qtyDiff =
      Math.round((nextCurrQty - existingContainer.currentQuantity) * 10000) / 10000;
    const roleLabel =
      effectiveProfile.role === UserRole.ADMIN
        ? 'Director'
        : effectiveProfile.role === UserRole.TECHNICIAN
        ? 'Lab Engineer'
        : 'Professor';

    const txId = `EDT-${Date.now().toString(36).toUpperCase()}`;
    const newTx: InventoryTransaction = {
      transactionId: txId,
      type:
        qtyDiff !== 0
          ? TransactionType.CORRECTION
          : existingContainer.location.code !== nextLoc.code
          ? TransactionType.TRANSFER
          : TransactionType.STATUS_CHANGE,
      timestamp: new Date().toISOString(),
      userId: effectiveProfile.uid,
      userName: `${effectiveProfile.fullName} (${roleLabel})`,
      userRole: effectiveProfile.role,
      laboratoryId: existingContainer.laboratoryId,
      containerId: finalContainerId,
      productId: existingContainer.productId,
      quantityChange: qtyDiff,
      quantityBefore: existingContainer.currentQuantity,
      quantityAfter: nextCurrQty,
      unit: params.unit,
      oldLocation: existingContainer.location.code,
      newLocation: nextLoc.code,
      oldStatus: existingContainer.status,
      newStatus: computedStatus,
      reason: `[Full Record Edit by ${roleLabel}] Updated ${params.chemicalName} (${finalContainerId}) at ${nextLoc.code}`,
    };

    updatePreviewState({
      products: updatedProducts,
      containers: updatedContainers,
      transactions: [newTx, ...transactions],
    });
  };

  const deleteContainerById = (containerId: string) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.ARCHIVE_REMOVE_CHEMICAL,
      'Only the Director or Lab Engineer can delete inventory items.'
    );
    updatePreviewState({
      containers: containers.filter((c) => c.containerId !== containerId),
    });
  };

  /**
   * Demo Inventory Reset & Clear Controls
   */
  const resetDemoInventory = () => {
    updatePreviewState({
      products: INITIAL_DEMO_PRODUCTS,
      containers: INITIAL_DEMO_CONTAINERS,
      transactions: INITIAL_DEMO_TRANSACTIONS,
      adjustmentRequests: INITIAL_DEMO_ADJUSTMENTS,
      disposalRequests: INITIAL_DEMO_DISPOSALS,
      purchaseRequests: INITIAL_DEMO_PURCHASES,
      stockRuptureRequests: INITIAL_DEMO_RUPTURES,
      notifications: INITIAL_DEMO_NOTIFICATIONS,
      physicalLocations: INITIAL_PHYSICAL_LOCATIONS,
    });
  };

  const clearDemoInventory = () => {
    updatePreviewState({
      products: products.filter((p) => !p.isDemoData),
      containers: containers.filter((c) => !c.isDemoData),
      transactions: transactions.filter((t) => !t.isDemoData),
    });
  };

  /**
   * Controlled Quantity Adjustment by Director and Lab Engineer
   * Updates container quantity, recalculates status, and records full audit history.
   */
  const adjustContainerQuantityDirectly = (params: {
    containerId: string;
    newQuantity: number;
    adjustmentType: StockAdjustmentReasonType;
    comment?: string;
  }) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    if (
      effectiveProfile.role !== UserRole.ADMIN &&
      effectiveProfile.role !== UserRole.TECHNICIAN
    ) {
      throw new Error(
        'Permission Denied: Only the Director or Lab Engineer can adjust container quantities directly.'
      );
    }

    const container = containers.find((c) => c.containerId === params.containerId);
    if (!container) throw new Error(`Container ${params.containerId} not found.`);
    const product = products.find((p) => p.productId === container.productId);
    const chemName = product?.chemicalName || container.productId;

    const fullReason = params.comment?.trim()
      ? `${params.adjustmentType} — ${params.comment.trim()}`
      : params.adjustmentType;

    const calc = calculateCorrectionMutation(
      container,
      params.newQuantity,
      container.unit,
      fullReason
    );

    const txId = `ADJ-${Date.now().toString(36).toUpperCase()}`;
    const roleLabel =
      effectiveProfile.role === UserRole.ADMIN ? 'Director' : 'Lab Engineer';

    const newNotifs = buildNotificationsForRecipients(allUsers, {
      type: NotificationType.STOCK_ADJUSTMENT_REQUEST,
      title: `Quantity Adjusted (${roleLabel}): ${chemName}`,
      message: `${effectiveProfile.fullName} (${roleLabel}) adjusted ${container.containerId} from ${calc.quantityBefore} ${container.unit} to ${calc.quantityAfter} ${container.unit} (Δ ${calc.quantityChange > 0 ? '+' : ''}${calc.quantityChange} ${container.unit}). Reason: ${fullReason}`,
      priority:
        calc.newStatus === ContainerStatus.NEARLY_EMPTY ||
        calc.newStatus === ContainerStatus.LOW_STOCK
          ? NotificationPriority.HIGH
          : NotificationPriority.MEDIUM,
      targetRoles:
        effectiveProfile.role === UserRole.ADMIN
          ? [UserRole.TECHNICIAN, UserRole.PROFESSOR]
          : [UserRole.ADMIN, UserRole.PROFESSOR],
      createdByUserId: effectiveProfile.uid,
      createdByName: effectiveProfile.fullName,
      relatedContainerId: container.containerId,
      relatedProductId: container.productId,
      relatedChemicalName: chemName,
    });

    updatePreviewState({
      notifications: [...newNotifs, ...notifications],
      containers: containers.map((c) =>
        c.containerId === container.containerId
          ? {
              ...c,
              currentQuantity: calc.quantityAfter,
              initialQuantity: Math.max(c.initialQuantity, calc.quantityAfter),
              status: calc.newStatus,
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
      transactions: [
        {
          transactionId: txId,
          type: TransactionType.CORRECTION,
          timestamp: new Date().toISOString(),
          userId: effectiveProfile.uid,
          userName: `${effectiveProfile.fullName} (${roleLabel})`,
          userRole: effectiveProfile.role,
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
          reason: `[Quantity Adjustment: ${params.adjustmentType}] ${
            params.comment?.trim() || 'Confirmed by ' + roleLabel
          }`,
          adjustmentType: params.adjustmentType,
        },
        ...transactions,
      ],
    });
  };

  /**
   * Reusable Role-Based Notification Dispatcher
   */
  const sendRoleNotification = (params: CreateRoleNotificationParams) => {
    const generated = buildNotificationsForRecipients(allUsers, params);
    if (generated.length === 0) return;
    updatePreviewState({
      notifications: [...generated, ...notifications],
    });
  };

  const markNotificationAsRead = (notificationId: string) => {
    const updated = markNotificationReadInList(notifications, notificationId);
    updatePreviewState({ notifications: updated });
  };

  const markAllNotificationsAsRead = () => {
    if (!effectiveProfile) return;
    const canonicalRoleUser = INITIAL_TEMPORARY_USERS.find(
      (u) => u.role === effectiveProfile.role
    );
    let updated = markAllUserNotificationsReadInList(notifications, effectiveProfile.uid);
    if (canonicalRoleUser && canonicalRoleUser.uid !== effectiveProfile.uid) {
      updated = markAllUserNotificationsReadInList(updated, canonicalRoleUser.uid);
    }
    updatePreviewState({ notifications: updated });
  };

  const reportStockRupture = (params: {
    containerId: string;
    priority: NotificationPriority;
    comment?: string;
  }) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.REPORT_STOCK_RUPTURE,
      'Your account is not authorized to report stock ruptures.'
    );

    const container = containers.find((c) => c.containerId === params.containerId);
    if (!container) throw new Error(`Container ${params.containerId} not found.`);
    const product = products.find((p) => p.productId === container.productId);

    const result = processStockRuptureReport({
      container,
      product,
      reporter: {
        uid: effectiveProfile.uid,
        fullName: effectiveProfile.fullName,
        role: effectiveProfile.role,
      },
      comment: params.comment,
      priority: params.priority,
      existingRuptures: stockRuptureRequests,
      existingNotifications: notifications,
      allUsers,
    });

    updatePreviewState({
      stockRuptureRequests: result.updatedRuptures,
      notifications: result.updatedNotifications,
    });

    return {
      ruptureRequest: result.ruptureRequest,
      wasMergedDuplicate: result.wasMergedDuplicate,
    };
  };

  const updateStockRuptureStatus = (params: {
    ruptureId: string;
    nextStatus: StockRuptureStatus;
    resolutionNote?: string;
  }) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.REVIEW_STOCK_RUPTURE,
      'Only a Lab Engineer or Director can inspect and update stock rupture reports.'
    );

    const result = transitionStockRuptureWorkflow({
      ruptureId: params.ruptureId,
      nextStatus: params.nextStatus,
      actor: {
        uid: effectiveProfile.uid,
        fullName: effectiveProfile.fullName,
        role: effectiveProfile.role,
      },
      resolutionNote: params.resolutionNote,
      existingRuptures: stockRuptureRequests,
      existingNotifications: notifications,
      allUsers,
    });

    updatePreviewState({
      stockRuptureRequests: result.updatedRuptures,
      notifications: result.updatedNotifications,
    });
  };

  const submitStockAdjustmentRequest = (params: {
    containerId: string;
    measuredQuantity: number;
    unit: ChemicalUnit;
    reason: string;
    adjustmentType?: StockAdjustmentReasonType;
  }) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.SUBMIT_STOCK_ADJUSTMENT,
      'PhD Students cannot submit or perform stock adjustments.'
    );

    const container = containers.find((c) => c.containerId === params.containerId);
    if (!container) throw new Error(`Container ${params.containerId} not found.`);
    const product = products.find((p) => p.productId === container.productId);

    const calc = calculateCorrectionMutation(
      container,
      params.measuredQuantity,
      params.unit,
      params.reason
    );

    const reqId = `ADJ-${Date.now().toString(36).toUpperCase()}`;
    const isDirector = effectiveProfile.role === UserRole.ADMIN;
    const chemName = product?.chemicalName || container.productId;

    const newRequest: StockAdjustmentRequest = {
      requestId: reqId,
      containerId: container.containerId,
      productId: container.productId,
      chemicalName: chemName,
      laboratoryId: container.laboratoryId,
      previousQuantity: calc.quantityBefore,
      newQuantity: calc.quantityAfter,
      difference: calc.quantityChange,
      unit: container.unit,
      adjustmentType: params.adjustmentType,
      reason: params.reason.trim(),
      requestedByUid: effectiveProfile.uid,
      requestedByName: effectiveProfile.fullName,
      requestedByRole: effectiveProfile.role,
      requestedAt: new Date().toISOString(),
      status: isDirector ? 'APPROVED' : 'PENDING',
      ...(isDirector
        ? {
            approverUid: effectiveProfile.uid,
            approverName: effectiveProfile.fullName,
            approverRole: effectiveProfile.role,
            approvedAt: new Date().toISOString(),
          }
        : {}),
    };

    if (isDirector) {
      const txId = `COR-${Date.now().toString(36).toUpperCase()}`;
      const newNotifs = buildNotificationsForRecipients(allUsers, {
        type: NotificationType.STOCK_ADJUSTMENT_REQUEST,
        title: `Stock Adjusted by Director: ${chemName}`,
        message: `Director adjusted ${container.containerId} (${chemName}) from ${calc.quantityBefore} to ${calc.quantityAfter} ${container.unit}. Reason: "${params.reason.trim()}"`,
        priority: NotificationPriority.MEDIUM,
        targetRoles: [UserRole.TECHNICIAN, UserRole.PROFESSOR],
        createdByUserId: effectiveProfile.uid,
        createdByName: effectiveProfile.fullName,
        relatedContainerId: container.containerId,
        relatedProductId: container.productId,
        relatedChemicalName: chemName,
        relatedRequestId: reqId,
      });

      updatePreviewState({
        adjustmentRequests: [newRequest, ...adjustmentRequests],
        notifications: [...newNotifs, ...notifications],
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
            type: TransactionType.CORRECTION,
            timestamp: new Date().toISOString(),
            userId: effectiveProfile.uid,
            userName: `${effectiveProfile.fullName} (Director)`,
            userRole: effectiveProfile.role,
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
            reason: `[Stock Adjustment ${reqId} Approved by Director] ${params.reason.trim()}`,
            adjustmentType: params.adjustmentType,
          },
          ...transactions,
        ],
      });
    } else {
      const newNotifs = buildNotificationsForRecipients(allUsers, {
        type: NotificationType.STOCK_ADJUSTMENT_REQUEST,
        title: `Stock Adjustment Request: ${chemName} (${container.containerId})`,
        message: `${effectiveProfile.fullName} submitted physical count ${reqId} for ${container.containerId}: ${calc.quantityBefore} → ${calc.quantityAfter} ${container.unit} (Δ ${calc.quantityChange > 0 ? '+' : ''}${calc.quantityChange} ${container.unit}). Reason: "${params.reason.trim()}"`,
        priority: NotificationPriority.HIGH,
        targetRoles: [UserRole.ADMIN],
        createdByUserId: effectiveProfile.uid,
        createdByName: effectiveProfile.fullName,
        relatedContainerId: container.containerId,
        relatedProductId: container.productId,
        relatedChemicalName: chemName,
        relatedRequestId: reqId,
      });

      updatePreviewState({
        adjustmentRequests: [newRequest, ...adjustmentRequests],
        notifications: [...newNotifs, ...notifications],
      });
    }
  };

  const approveStockAdjustmentRequest = (requestId: string, approve: boolean) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.APPROVE_STOCK_ADJUSTMENT,
      'Only the Director can approve stock adjustment requests.'
    );

    const reqItem = adjustmentRequests.find((r) => r.requestId === requestId);
    if (!reqItem || reqItem.status !== 'PENDING') {
      throw new Error('Stock adjustment request not found or already processed.');
    }

    const updatedRequests = adjustmentRequests.map((r) =>
      r.requestId === requestId
        ? {
            ...r,
            status: (approve ? 'APPROVED' : 'REJECTED') as 'APPROVED' | 'REJECTED',
            approverUid: effectiveProfile.uid,
            approverName: effectiveProfile.fullName,
            approverRole: effectiveProfile.role,
            approvedAt: new Date().toISOString(),
          }
        : r
    );

    const resolvedNotifs = resolveNotificationsByRequestId(
      notifications,
      requestId,
      effectiveProfile.uid,
      effectiveProfile.fullName
    );

    const requesterFeedback = buildNotificationsForRecipients(allUsers, {
      type: NotificationType.STOCK_ADJUSTMENT_REQUEST,
      title: `Stock Adjustment ${approve ? 'Approved' : 'Rejected'}: ${reqItem.chemicalName}`,
      message: `Director ${effectiveProfile.fullName} ${approve ? 'APPROVED' : 'REJECTED'} your stock adjustment request (${reqItem.requestId}) for ${reqItem.containerId} (${reqItem.previousQuantity} → ${reqItem.newQuantity} ${reqItem.unit}).`,
      priority: NotificationPriority.MEDIUM,
      targetRoles: [],
      targetUserIds: [reqItem.requestedByUid],
      createdByUserId: effectiveProfile.uid,
      createdByName: effectiveProfile.fullName,
      relatedContainerId: reqItem.containerId,
      relatedProductId: reqItem.productId,
      relatedChemicalName: reqItem.chemicalName,
      relatedRequestId: reqItem.requestId,
    });

    if (!approve) {
      updatePreviewState({
        adjustmentRequests: updatedRequests,
        notifications: [...requesterFeedback, ...resolvedNotifs],
      });
      return;
    }

    const container = containers.find((c) => c.containerId === reqItem.containerId);
    if (!container) {
      updatePreviewState({
        adjustmentRequests: updatedRequests,
        notifications: [...requesterFeedback, ...resolvedNotifs],
      });
      return;
    }

    const newStatus = computeStockStatus(reqItem.newQuantity, container.initialQuantity);
    const txId = `COR-${Date.now().toString(36).toUpperCase()}`;

    updatePreviewState({
      adjustmentRequests: updatedRequests,
      notifications: [...requesterFeedback, ...resolvedNotifs],
      containers: containers.map((c) =>
        c.containerId === container.containerId
          ? {
              ...c,
              currentQuantity: reqItem.newQuantity,
              status: newStatus,
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
      transactions: [
        {
          transactionId: txId,
          type: TransactionType.CORRECTION,
          timestamp: new Date().toISOString(),
          userId: effectiveProfile.uid,
          userName: `${effectiveProfile.fullName} (Director · Approved ${reqItem.requestedByName}'s Count)`,
          userRole: effectiveProfile.role,
          laboratoryId: container.laboratoryId,
          containerId: container.containerId,
          productId: container.productId,
          quantityChange: reqItem.difference,
          quantityBefore: reqItem.previousQuantity,
          quantityAfter: reqItem.newQuantity,
          unit: container.unit,
          oldLocation: container.location.code,
          newLocation: container.location.code,
          oldStatus: container.status,
          newStatus,
          reason: `[Approved Stock Adjustment ${reqItem.requestId} by ${reqItem.requestedByName}] ${reqItem.reason}`,
          adjustmentType: reqItem.adjustmentType,
        },
        ...transactions,
      ],
    });
  };

  const createDisposalRequest = (params: { containerId: string; reason: string }) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(effectiveProfile.role, PermissionAction.CREATE_DISPOSAL_REQUEST);

    const container = containers.find((c) => c.containerId === params.containerId);
    if (!container) throw new Error(`Container ${params.containerId} not found.`);
    const product = products.find((p) => p.productId === container.productId);
    const chemName = product?.chemicalName || container.productId;

    const disposalId = `DSP-${Date.now().toString(36).toUpperCase()}`;
    const newItem: DisposalWorkflowItem = {
      disposalId,
      containerId: container.containerId,
      productId: container.productId,
      chemicalName: chemName,
      quantity: container.currentQuantity,
      unit: container.unit,
      locationCode: container.location.code,
      laboratoryId: container.laboratoryId,
      reason: params.reason.trim(),
      requestedByUid: effectiveProfile.uid,
      requestedByName: effectiveProfile.fullName,
      requestedByRole: effectiveProfile.role,
      requestedAt: new Date().toISOString(),
      status: 'REQUESTED',
    };

    const newNotifs = buildNotificationsForRecipients(allUsers, {
      type: NotificationType.DISPOSAL_REQUEST,
      title: `Disposal Request: ${chemName} (${container.containerId})`,
      message: `${effectiveProfile.fullName} requested chemical disposal (${disposalId}) for ${container.containerId} (${chemName}, ${container.currentQuantity} ${container.unit} at ${container.location.code}). Reason: "${params.reason.trim()}"`,
      priority: NotificationPriority.HIGH,
      targetRoles: [UserRole.ADMIN, UserRole.PROFESSOR, UserRole.TECHNICIAN],
      createdByUserId: effectiveProfile.uid,
      createdByName: effectiveProfile.fullName,
      relatedContainerId: container.containerId,
      relatedProductId: container.productId,
      relatedChemicalName: chemName,
      relatedRequestId: disposalId,
    });

    const txId = `DSP-REQ-${Date.now().toString(36).toUpperCase()}`;
    updatePreviewState({
      disposalRequests: [newItem, ...disposalRequests],
      notifications: [...newNotifs, ...notifications],
      containers: containers.map((c) =>
        c.containerId === container.containerId
          ? { ...c, status: ContainerStatus.QUARANTINED, updatedAt: new Date().toISOString() }
          : c
      ),
      transactions: [
        {
          transactionId: txId,
          type: TransactionType.STATUS_CHANGE,
          timestamp: new Date().toISOString(),
          userId: effectiveProfile.uid,
          userName: `${effectiveProfile.fullName}`,
          userRole: effectiveProfile.role,
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
          newStatus: ContainerStatus.QUARANTINED,
          reason: `[Disposal Requested ${disposalId}] ${params.reason.trim()}`,
        },
        ...transactions,
      ],
    });
  };

  const approveDisposalRequest = (disposalId: string, approve: boolean) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.APPROVE_DISPOSAL_REQUEST,
      'Only an authorized Professor or Director can approve disposal requests.'
    );

    const item = disposalRequests.find((d) => d.disposalId === disposalId);
    if (!item || item.status !== 'REQUESTED') {
      throw new Error('Disposal request not found or already processed.');
    }

    const updatedDisposals = disposalRequests.map((d) =>
      d.disposalId === disposalId
        ? {
            ...d,
            status: (approve ? 'APPROVED' : 'REJECTED') as 'APPROVED' | 'REJECTED',
            approvedByUid: effectiveProfile.uid,
            approvedByName: effectiveProfile.fullName,
            approvedByRole: effectiveProfile.role,
            approvedAt: new Date().toISOString(),
          }
        : d
    );

    const followUpNotifs = buildNotificationsForRecipients(allUsers, {
      type: NotificationType.DISPOSAL_REQUEST,
      title: `Disposal Request ${approve ? 'Approved' : 'Rejected'}: ${item.chemicalName}`,
      message: `${effectiveProfile.fullName} ${approve ? 'APPROVED' : 'REJECTED'} disposal request ${item.disposalId} for ${item.containerId} (${item.chemicalName}). ${
        approve
          ? 'Lab Engineer can now record physical hazardous waste disposal.'
          : 'Container restored to active stock.'
      }`,
      priority: approve ? NotificationPriority.HIGH : NotificationPriority.MEDIUM,
      targetRoles: approve ? [UserRole.TECHNICIAN, UserRole.ADMIN] : [UserRole.ADMIN],
      targetUserIds: [item.requestedByUid],
      createdByUserId: effectiveProfile.uid,
      createdByName: effectiveProfile.fullName,
      relatedContainerId: item.containerId,
      relatedProductId: item.productId,
      relatedChemicalName: item.chemicalName,
      relatedRequestId: item.disposalId,
    });

    const container = containers.find((c) => c.containerId === item.containerId);
    if (!container) {
      updatePreviewState({
        disposalRequests: updatedDisposals,
        notifications: [...followUpNotifs, ...notifications],
      });
      return;
    }

    const nextContainerStatus = approve
      ? ContainerStatus.DISPOSAL_REQUIRED
      : computeStockStatus(container.currentQuantity, container.initialQuantity);

    const txId = `DSP-APP-${Date.now().toString(36).toUpperCase()}`;

    updatePreviewState({
      disposalRequests: updatedDisposals,
      notifications: [...followUpNotifs, ...notifications],
      containers: containers.map((c) =>
        c.containerId === container.containerId
          ? { ...c, status: nextContainerStatus, updatedAt: new Date().toISOString() }
          : c
      ),
      transactions: [
        {
          transactionId: txId,
          type: TransactionType.STATUS_CHANGE,
          timestamp: new Date().toISOString(),
          userId: effectiveProfile.uid,
          userName: `${effectiveProfile.fullName}`,
          userRole: effectiveProfile.role,
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
          newStatus: nextContainerStatus,
          reason: approve
            ? `[Disposal Approved ${disposalId} by ${effectiveProfile.fullName}] Ready for Lab Engineer physical disposal.`
            : `[Disposal Rejected ${disposalId} by ${effectiveProfile.fullName}] Restored to active stock.`,
        },
        ...transactions,
      ],
    });
  };

  const recordPhysicalDisposal = (disposalId: string, wasteManifestCode = 'LCSCO-HAZ-2026') => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.RECORD_APPROVED_DISPOSAL,
      'Only a Lab Engineer or Director can record physical chemical disposal.'
    );

    const item = disposalRequests.find((d) => d.disposalId === disposalId);
    if (!item || item.status !== 'APPROVED') {
      throw new Error(
        'Disposal must be APPROVED by a Professor or Director before recording physical disposal.'
      );
    }

    const updatedDisposals = disposalRequests.map((d) =>
      d.disposalId === disposalId
        ? {
            ...d,
            status: 'DISPOSED' as const,
            disposedByUid: effectiveProfile.uid,
            disposedByName: effectiveProfile.fullName,
            disposedAt: new Date().toISOString(),
            wasteManifestCode,
          }
        : d
    );

    const resolvedNotifs = resolveNotificationsByRequestId(
      notifications,
      disposalId,
      effectiveProfile.uid,
      effectiveProfile.fullName
    );

    const container = containers.find((c) => c.containerId === item.containerId);
    const txId = `DSP-FIN-${Date.now().toString(36).toUpperCase()}`;

    updatePreviewState({
      disposalRequests: updatedDisposals,
      notifications: resolvedNotifs,
      containers: containers.map((c) =>
        c.containerId === item.containerId
          ? {
              ...c,
              currentQuantity: 0,
              status: ContainerStatus.DISPOSAL_REQUIRED,
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
      transactions: container
        ? [
            {
              transactionId: txId,
              type: TransactionType.STATUS_CHANGE,
              timestamp: new Date().toISOString(),
              userId: effectiveProfile.uid,
              userName: `${effectiveProfile.fullName}`,
              userRole: effectiveProfile.role,
              laboratoryId: container.laboratoryId,
              containerId: container.containerId,
              productId: container.productId,
              quantityChange: -container.currentQuantity,
              quantityBefore: container.currentQuantity,
              quantityAfter: 0,
              unit: container.unit,
              oldLocation: container.location.code,
              newLocation: 'HAZARDOUS-WASTE-BUNKER',
              oldStatus: container.status,
              newStatus: ContainerStatus.DISPOSAL_REQUIRED,
              reason: `[Physical Disposal Recorded ${disposalId}] Manifest: ${wasteManifestCode}`,
            },
            ...transactions,
          ]
        : transactions,
    });
  };

  const createPurchaseRequest = (params: {
    chemicalName: string;
    casNumber: string;
    formula: string;
    requestedQuantity: number;
    unit: ChemicalUnit;
    supplier: string;
    reason: string;
    targetPlacementBox?: string;
  }) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(effectiveProfile.role, PermissionAction.CREATE_PURCHASE_REQUEST);

    const purchaseId = `PUR-${Date.now().toString(36).toUpperCase()}`;
    const newItem: PurchaseWorkflowItem = {
      purchaseId,
      chemicalName: params.chemicalName.trim(),
      casNumber: params.casNumber.trim() || 'N/A',
      formula: params.formula.trim() || 'N/A',
      requestedQuantity: Number(params.requestedQuantity),
      unit: params.unit,
      supplier: params.supplier.trim() || 'Sigma-Aldrich',
      laboratoryId: 'LCSCO',
      reason: params.reason.trim(),
      requestedByUid: effectiveProfile.uid,
      requestedByName: effectiveProfile.fullName,
      requestedByRole: effectiveProfile.role,
      requestedAt: new Date().toISOString(),
      status: 'REQUESTED',
      targetPlacementBox: params.targetPlacementBox || 'FLAM-01',
    };

    const newNotifs = buildNotificationsForRecipients(allUsers, {
      type: NotificationType.PURCHASE_REQUEST,
      title: `New Purchase Request: ${newItem.chemicalName} (${newItem.requestedQuantity} ${newItem.unit})`,
      message: `${effectiveProfile.fullName} requested ${newItem.requestedQuantity} ${newItem.unit} of ${newItem.chemicalName} (${purchaseId}) from ${newItem.supplier}. Reason: "${newItem.reason}"`,
      priority: NotificationPriority.MEDIUM,
      targetRoles: [UserRole.ADMIN, UserRole.PROFESSOR],
      targetUserIds: [effectiveProfile.uid],
      createdByUserId: effectiveProfile.uid,
      createdByName: effectiveProfile.fullName,
      relatedChemicalName: newItem.chemicalName,
      relatedRequestId: purchaseId,
    });

    updatePreviewState({
      purchaseRequests: [newItem, ...purchaseRequests],
      notifications: [...newNotifs, ...notifications],
    });
  };

  const approveOrOrderPurchaseRequest = (
    purchaseId: string,
    nextStage: 'APPROVED' | 'ORDERED'
  ) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.APPROVE_PURCHASE_REQUEST,
      'Only the Director or an authorized Professor can approve purchase requests.'
    );

    const target = purchaseRequests.find((p) => p.purchaseId === purchaseId);
    const updated = purchaseRequests.map((p) =>
      p.purchaseId === purchaseId
        ? {
            ...p,
            status: nextStage,
            approvedByUid: p.approvedByUid || effectiveProfile.uid,
            approvedByName: p.approvedByName || effectiveProfile.fullName,
            approvedByRole: p.approvedByRole || effectiveProfile.role,
            approvedAt: p.approvedAt || new Date().toISOString(),
            ...(nextStage === 'ORDERED' ? { orderedAt: new Date().toISOString() } : {}),
          }
        : p
    );

    const approvalNotifs = target
      ? buildNotificationsForRecipients(allUsers, {
          type: NotificationType.PURCHASE_APPROVED,
          title: `Purchase ${nextStage === 'APPROVED' ? 'Approved' : 'Ordered'}: ${target.chemicalName}`,
          message: `${effectiveProfile.fullName} marked purchase request ${target.purchaseId} (${target.requestedQuantity} ${target.unit} ${target.chemicalName}) as ${nextStage}. Lab Engineer will receive delivery into Cabinet ${target.targetPlacementBox || 'FLAM-01'}.`,
          priority: NotificationPriority.MEDIUM,
          targetRoles: [UserRole.TECHNICIAN, UserRole.ADMIN],
          targetUserIds: [target.requestedByUid],
          createdByUserId: effectiveProfile.uid,
          createdByName: effectiveProfile.fullName,
          relatedChemicalName: target.chemicalName,
          relatedRequestId: target.purchaseId,
        })
      : [];

    updatePreviewState({
      purchaseRequests: updated,
      notifications: [...approvalNotifs, ...notifications],
    });
  };

  const receivePurchaseOrderIntoInventory = (params: {
    purchaseId: string;
    newContainerId: string;
    lotNumber: string;
    expiryDate: string;
    placementBox: string;
    room: string;
    side?: 'Left' | 'Right';
    shelf?: string;
    position?: string;
  }) => {
    if (!effectiveProfile) throw new Error('Authentication required.');
    assertRolePermission(
      effectiveProfile.role,
      PermissionAction.RECEIVE_VALIDATED_DELIVERY,
      'Only a Lab Engineer or Director can receive incoming deliveries and add them to inventory.'
    );

    const item = purchaseRequests.find((p) => p.purchaseId === params.purchaseId);
    if (!item || (item.status !== 'APPROVED' && item.status !== 'ORDERED')) {
      throw new Error('Purchase request must be APPROVED or ORDERED before receiving delivery.');
    }

    let matchingProduct = products.find(
      (prod) =>
        prod.chemicalName.toLowerCase().includes(item.chemicalName.toLowerCase()) ||
        (item.casNumber !== 'N/A' && prod.casNumber === item.casNumber)
    );

    let nextProducts = products;
    if (!matchingProduct) {
      matchingProduct = {
        productId: `PROD-${Date.now().toString(36).toUpperCase()}`,
        chemicalName: item.chemicalName,
        casNumber: item.casNumber,
        formula: item.formula,
        molecularWeight: 100,
        hazardClass: ['GHS07 Irritant'],
        storageRequirements: `Cabinet ${params.placementBox}`,
        defaultUnit: item.unit,
        minimumStock: Math.round(item.requestedQuantity * 0.2),
        reorderLevel: Math.round(item.requestedQuantity * 0.4),
        sdsUrl: 'https://pubchem.ncbi.nlm.nih.gov',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      nextProducts = [...products, matchingProduct];
    }

    const containerId = params.newContainerId.trim().toUpperCase();
    const matchedCab = physicalLocations.find(
      (p) => p.cabinet === (params.placementBox || item.targetPlacementBox || 'FLAM-01')
    );
    const loc = buildStorageLocation({
      building: 'LCSCO',
      room: params.room || matchedCab?.room || '204',
      unit: params.placementBox || item.targetPlacementBox || 'FLAM-01',
      cabinetLabel: matchedCab?.cabinetLabel || 'Storage Cabinet',
      side: params.side || 'Left',
      shelf: params.shelf || '1',
      position: params.position || '01',
    });

    const newBottle: ChemicalContainer = {
      containerId,
      productId: matchingProduct.productId,
      laboratoryId: 'LCSCO',
      initialQuantity: item.requestedQuantity,
      currentQuantity: item.requestedQuantity,
      unit: item.unit,
      location: loc,
      storageCondition: `Received from Purchase ${item.purchaseId}`,
      status: ContainerStatus.NORMAL,
      lotNumber: params.lotNumber.trim() || 'LOT-2026-RCV',
      supplier: item.supplier,
      expiryDate: params.expiryDate || '2028-12-31',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: effectiveProfile.uid,
    };

    const txId = `RCV-${Date.now().toString(36).toUpperCase()}`;
    const updatedPurchases = purchaseRequests.map((p) =>
      p.purchaseId === params.purchaseId
        ? {
            ...p,
            status: 'RECEIVED' as const,
            receivedByUid: effectiveProfile.uid,
            receivedByName: effectiveProfile.fullName,
            receivedAt: new Date().toISOString(),
            receivedContainerId: containerId,
          }
        : p
    );

    const resolvedNotifs = resolveNotificationsByRequestId(
      notifications,
      item.purchaseId,
      effectiveProfile.uid,
      effectiveProfile.fullName
    );

    const receivedNotifs = buildNotificationsForRecipients(allUsers, {
      type: NotificationType.PURCHASE_RECEIVED,
      title: `Purchase Received & Available: ${item.chemicalName} (${containerId})`,
      message: `${effectiveProfile.fullName} received ${item.requestedQuantity} ${item.unit} of ${item.chemicalName} (Purchase ${item.purchaseId}) and registered container ${containerId} at ${loc.code}. Now available for laboratory use.`,
      priority: NotificationPriority.MEDIUM,
      targetRoles: [UserRole.ADMIN, UserRole.PROFESSOR],
      targetUserIds: [item.requestedByUid],
      createdByUserId: effectiveProfile.uid,
      createdByName: effectiveProfile.fullName,
      relatedContainerId: containerId,
      relatedProductId: matchingProduct.productId,
      relatedChemicalName: item.chemicalName,
      relatedRequestId: item.purchaseId,
    });

    updatePreviewState({
      products: nextProducts,
      containers: [newBottle, ...containers],
      purchaseRequests: updatedPurchases,
      notifications: [...receivedNotifs, ...resolvedNotifs],
      transactions: [
        {
          transactionId: txId,
          type: TransactionType.ADDITION,
          timestamp: new Date().toISOString(),
          userId: effectiveProfile.uid,
          userName: `${effectiveProfile.fullName}`,
          userRole: effectiveProfile.role,
          laboratoryId: 'LCSCO',
          containerId,
          productId: matchingProduct.productId,
          quantityChange: item.requestedQuantity,
          quantityBefore: 0,
          quantityAfter: item.requestedQuantity,
          unit: item.unit,
          oldLocation: loc.code,
          newLocation: loc.code,
          oldStatus: ContainerStatus.NORMAL,
          newStatus: ContainerStatus.NORMAL,
          reason: `[Purchase Order ${item.purchaseId} Received & Added to Inventory] Requested by ${item.requestedByName}, Approved by ${item.approvedByName || 'Director'}`,
        },
        ...transactions,
      ],
    });
  };

  return (
    <AuthAndInventoryContext.Provider
      value={{
        firebaseUser,
        profile: effectiveProfile,
        isPreviewMode: !firebaseUser && isPreviewMode,
        enterPreviewMode: () => setIsPreviewMode(true),
        exitPreviewMode: () => setIsPreviewMode(false),
        loginWithTemporaryAccount,
        resetAccountsToFourTemporary,
        authReady,
        dataLoading,
        error,
        clearError: () => setError(null),
        signInWithGoogle,
        signOut,
        switchMyRoleForTesting,
        laboratories,
        products,
        containers,
        transactions,
        allUsers,
        adjustmentRequests,
        disposalRequests,
        purchaseRequests,
        stockRuptureRequests,
        notifications,
        myNotifications,
        unreadNotificationCount,
        physicalLocations,
        labFloorPlanConfig,
        updateLabFloorPlanConfig,
        updatePreviewState,
        savePhysicalLocation,
        deletePhysicalLocation,
        renameShelfInCabinet,
        deleteShelfFromCabinet,
        updateContainerAndProduct,
        deleteContainerById,
        resetDemoInventory,
        clearDemoInventory,
        adjustContainerQuantityDirectly,
        sendRoleNotification,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        reportStockRupture,
        updateStockRuptureStatus,
        canPerform,
        submitStockAdjustmentRequest,
        approveStockAdjustmentRequest,
        createDisposalRequest,
        approveDisposalRequest,
        recordPhysicalDisposal,
        createPurchaseRequest,
        approveOrOrderPurchaseRequest,
        receivePurchaseOrderIntoInventory,
        isAdmin,
        isProfessor,
        isTechnician,
        isPhdStudent,
        isAdminOrProf,
        isTechOrAbove,
        isActiveLabMember,
      }}
    >
      {children}
    </AuthAndInventoryContext.Provider>
  );
};

export function useInventoryContext(): AuthAndInventoryContextValue {
  const ctx = useContext(AuthAndInventoryContext);
  if (!ctx) {
    throw new Error('useInventoryContext must be used within an AuthAndInventoryProvider');
  }
  return ctx;
}
