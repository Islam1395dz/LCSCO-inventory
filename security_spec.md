# Security Specification & Payload-First TDD (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Unmatched paths are strictly rejected (`allow read, write: if false;`).
2. **Email Verification & Authentication**: Every write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation (`users/{uid}`)**: User documents contain `email` and `fullName`. Only the document owner (`request.auth.uid == uid`) or a verified Admin/Professor (`isAdminOrProf()`) can read a user document. Non-admin users cannot self-assign `ADMIN`, `PROFESSOR`, or `TECHNICIAN` roles on registration, nor can they elevate their own `role` or `status` on update.
4. **Relational Existence (`containers`, `transactions`)**:
   - A `container` cannot be created unless `exists(/databases/$(database)/documents/products/$(incoming().productId))` and `exists(/databases/$(database)/documents/laboratories/$(incoming().laboratoryId))` are true.
   - A `transaction` cannot be created unless `exists(/databases/$(database)/documents/containers/$(incoming().containerId))` and `exists(/databases/$(database)/documents/products/$(incoming().productId))` are true.
5. **Immutable Audit Trail (`transactions/{transactionId}`)**:
   - Strictly append-only. `allow update, delete: if false;` for ALL users, including `ADMIN`.
   - `userId` must match `request.auth.uid`, and `timestamp` must equal `request.time`.
6. **Negative Stock & Terminal State Locking (`containers/{containerId}`)**:
   - `currentQuantity >= 0` and `initialQuantity > 0` at all times.
   - Once a container reaches `DISPOSAL_REQUIRED`, non-Admin/Professor users cannot modify it.
   - `containerId`, `productId`, `initialQuantity`, `unit`, `createdAt`, and `createdBy` are immortal (immutable) after creation.
7. **Secure List Queries**: Every `allow list` rule evaluates `resource.data` (e.g., `resource.data.currentQuantity >= 0`, `resource.data.molecularWeight >= 0`, etc.) and user authorization without delegating security solely to the client.

---

## 2. The "Dirty Dozen" Payloads (Designed to Break Identity, Integrity, and State)

1. **Payload 1 (Self-Assigned Admin Role on User Create)**:
   ```json
   {
     "uid": "attacker_uid",
     "fullName": "Mallory",
     "email": "mallory@lab.edu",
     "role": "ADMIN",
     "laboratoryIds": ["LAB-01"],
     "status": "ACTIVE",
     "createdAt": "SERVER_TIMESTAMP",
     "lastLogin": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (Non-bootstrapped user cannot self-assign `ADMIN`).

2. **Payload 2 (Privilege Escalation via User Update)**:
   ```json
   {
     "role": "PROFESSOR",
     "lastLogin": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (Owner update `affectedKeys().hasOnly(['fullName', 'lastLogin'])` blocks `role` modification).

3. **Payload 3 (PII Lateral Read on `users/{otherUid}`)**:
   Authenticated `PHD_STUDENT` (`uid: "student_1"`) attempts `get(/users/student_2)`.
   *Expected*: `PERMISSION_DENIED` (PII isolation restricts read to `isOwner(uid) || isAdminOrProf()`).

4. **Payload 4 (Unverified Email Spoofing Bootstrapped Admin)**:
   Token has `email: "islam.hasnaoui13@gmail.com"` and `email_verified: false`.
   *Expected*: `PERMISSION_DENIED` (`isVerified()` requires `request.auth.token.email_verified == true`).

5. **Payload 5 (Shadow Field Injection on Product Create)**:
   ```json
   {
     "productId": "PROD-001",
     "chemicalName": "Acetone",
     "casNumber": "67-64-1",
     "formula": "C3H6O",
     "molecularWeight": 58.08,
     "hazardClass": ["Flammable"],
     "storageRequirements": "Flammable Cabinet",
     "defaultUnit": "mL",
     "minimumStock": 500,
     "reorderLevel": 1000,
     "sdsUrl": "https://example.com/sds",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP",
     "isVerifiedGhostField": true
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`data.keys().hasOnly(...)` blocks shadow fields).

6. **Payload 6 (Orphaned Container Create with Non-Existent Product)**:
   `container` payload with `productId: "NON_EXISTENT_PROD"`.
   *Expected*: `PERMISSION_DENIED` (`exists(.../products/$(incoming().productId))` fails).

7. **Payload 7 (Negative Stock Update on Container)**:
   `container` update setting `currentQuantity: -25`.
   *Expected*: `PERMISSION_DENIED` (`isValidContainer` enforces `data.currentQuantity >= 0`).

8. **Payload 8 (Cross-Unit Mutation on Container Update)**:
   `container` update changing `unit` from `"g"` to `"mL"`.
   *Expected*: `PERMISSION_DENIED` (`incoming().unit == existing().unit` immortal field check + `affectedKeys().hasOnly(...)` rejects unit change).

9. **Payload 9 (Identity Spoofing on Transaction Create)**:
   `transaction` payload where `userId: "professor_uid"` but `request.auth.uid == "student_uid"`.
   *Expected*: `PERMISSION_DENIED` (`incoming().userId == request.auth.uid` fails).

10. **Payload 10 (Audit Trail Tampering — Admin Attempting Transaction Update)**:
    Authenticated `ADMIN` attempts `updateDoc(doc(db, 'transactions', 'TX-001'), { quantityChange: 5 })`.
    *Expected*: `PERMISSION_DENIED` (`allow update: if false;`).

11. **Payload 11 (Audit Trail Destruction — Admin Attempting Transaction Delete)**:
    Authenticated `ADMIN` attempts `deleteDoc(doc(db, 'transactions', 'TX-001'))`.
    *Expected*: `PERMISSION_DENIED` (`allow delete: if false;`).

12. **Payload 12 (Resource Poisoning — 2KB String in Container ID or Reason)**:
    `transaction` payload with `reason` of length 2000 characters.
    *Expected*: `PERMISSION_DENIED` (`data.reason.size() <= 500` fails).
