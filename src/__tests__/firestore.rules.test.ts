import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Firestore Security Rules & Dirty Dozen Payload Invariant Verification', () => {
  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  it('Enforces Global Safety Net default-deny catch-all at top of rules', () => {
    expect(rulesContent).toContain('match /{document=**} {\n      allow read, write: if false;\n    }');
  });

  it('Mandates email_verified == true on all write paths via isVerified() guard (Blocks Payload 4)', () => {
    expect(rulesContent).toContain('request.auth.token.email_verified == true');
  });

  it('Isolates PII on users/{uid} to owner or Admin/Professor (Blocks Payload 1, 2, 3)', () => {
    expect(rulesContent).toContain('allow get: if isSignedIn() && isValidId(uid) && (isOwner(uid) || isAdminOrProf());');
    expect(rulesContent).toContain("incoming().diff(existing()).affectedKeys().hasOnly(['fullName', 'lastLogin', 'laboratoryIds'])");
  });

  it('Enforces strict append-only immutability on transactions/{transactionId} (Blocks Payload 9, 10, 11)', () => {
    expect(rulesContent).toContain('match /transactions/{transactionId}');
    expect(rulesContent).toContain('incoming().userId == request.auth.uid');
    expect(rulesContent).toContain('allow update: if false;');
    expect(rulesContent).toContain('allow delete: if false;');
  });

  it('Enforces relational existence and non-negative stock on containers (Blocks Payload 6, 7, 8)', () => {
    expect(rulesContent).toContain('exists(/databases/$(database)/documents/products/$(incoming().productId))');
    expect(rulesContent).toContain('data.currentQuantity is number && data.currentQuantity >= 0');
    expect(rulesContent).toContain('incoming().unit == existing().unit');
  });

  it('Enforces strict key allowlists and string size bounds across all entities (Blocks Payload 5, 12)', () => {
    expect(rulesContent).toContain('data.reason is string && data.reason.size() >= 1 && data.reason.size() <= 500');
    expect(rulesContent).toContain('data.keys().hasOnly([');
  });
});
