import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { FirestoreErrorInfo, OperationType } from './types/inventory';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Validates connection to Firestore on boot as required by the Firebase Integration specification.
 */
export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testFirestoreConnection();

/**
 * Standardized Firestore Error Handler
 * Wraps permission or operational failures into a structured JSON error payload.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const rawMessage = error instanceof Error ? error.message : String(error);

  // Preserve custom business logic validation errors clearly while also logging structured info
  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Helper to extract a human-readable message from either a structured FirestoreErrorInfo JSON
 * or a standard Error instance for clean UI display.
 */
export function parseDisplayError(err: unknown): string {
  if (!err) return 'An unexpected error occurred.';
  const message = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(message) as Partial<FirestoreErrorInfo>;
    if (parsed && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {
    // Not a JSON string, return raw message
  }
  return message;
}
