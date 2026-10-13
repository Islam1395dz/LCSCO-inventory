import React, { useState } from 'react';
import {
  ExternalLink,
  KeyRound,
  Lock,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UserProfile, UserRole, UserStatus } from '../types/inventory';
import { formatRoleLabel, LCSCO_FOUR_ACCOUNT_ROLES } from '../utils/formatters';
import {
  createLabMemberProfile,
  deleteLabMemberProfile,
  updateUserPermissions,
} from '../services/inventoryService';
import { parseDisplayError } from '../firebase';
import { Button, PageHeader } from './DesignSystem';

export const UserManagementView: React.FC = () => {
  const {
    profile,
    firebaseUser,
    isPreviewMode,
    updatePreviewState,
    products,
    containers,
    allUsers,
    isAdmin,
    signOut,
  } = useInventoryContext();

  const { language, tr } = useLanguage();

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<'USERS' | 'CATALOG'>('USERS');
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('LCSCO-2026');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>(UserRole.PHD_STUDENT);
  const [resetPassTarget, setResetPassTarget] = useState<UserProfile | null>(null);
  const [resetTempPassword, setResetTempPassword] = useState('LCSCO-2026');

  const productAggregateStock = React.useMemo(() => {
    const map = new Map<string, number>();
    containers.forEach((c) => {
      const current = map.get(c.productId) || 0;
      map.set(c.productId, Math.round((current + c.currentQuantity) * 10000) / 10000);
    });
    return map;
  }, [containers]);

  const handleCreateMemberProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setFeedback(null);

    try {
      if (!isAdmin) {
        throw new Error(
          tr(
            'Only the Director can add or remove profiles.',
            'Seul le Directeur peut ajouter ou supprimer des profils.'
          )
        );
      }

      const tempPassword = newMemberPassword.trim() || 'LCSCO-2026';
      const generatedUid = `LCSCO-${Date.now().toString(36).toUpperCase()}`;

      let createdUid = generatedUid;
      if (firebaseUser) {
        createdUid = await createLabMemberProfile({
          uid: generatedUid,
          fullName: newMemberName.trim(),
          email: newMemberEmail.trim(),
          role: newMemberRole,
          laboratoryIds: ['LCSCO'],
          password: tempPassword,
          mustChangePassword: true,
          status: UserStatus.ACTIVE,
          actor: {
            uid: profile.uid,
            fullName: profile.fullName,
            role: profile.role,
          },
        });
      } else {
        try {
          createdUid = await createLabMemberProfile({
            uid: generatedUid,
            fullName: newMemberName.trim(),
            email: newMemberEmail.trim(),
            role: newMemberRole,
            laboratoryIds: ['LCSCO'],
            password: tempPassword,
            mustChangePassword: true,
            status: UserStatus.ACTIVE,
            actor: {
              uid: profile.uid,
              fullName: profile.fullName,
              role: profile.role,
            },
          });
        } catch {
          const createdUser: UserProfile = {
            uid: generatedUid,
            fullName: newMemberName.trim(),
            email: newMemberEmail.trim(),
            password: tempPassword,
            mustChangePassword: true,
            role: newMemberRole,
            laboratoryIds: ['LCSCO'],
            status: UserStatus.ACTIVE,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
          };
          updatePreviewState({
            users: [...allUsers, createdUser],
          });
        }
      }
      localStorage.setItem(`lcsco_pass_${createdUid}`, tempPassword);
      localStorage.setItem(`lcsco_must_change_pass_${createdUid}`, 'true');

      setFeedback({
        type: 'success',
        message: tr(
          `Added user ${newMemberName} (${formatRoleLabel(newMemberRole, language)}) with temporary password "${tempPassword}". They will be required to change their password on first login.`,
          `Utilisateur ${newMemberName} ajouté (${formatRoleLabel(newMemberRole, language)}) avec le mot de passe temporaire « ${tempPassword} ». Il devra modifier son mot de passe lors de sa première connexion.`
        ),
      });
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberPassword('LCSCO-2026');
      setShowAddUserModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleRemoveMemberProfile = async (targetUser: UserProfile) => {
    if (!profile) return;
    setFeedback(null);

    try {
      if (targetUser.uid === profile.uid) {
        throw new Error(
          tr(
            'Cannot remove your own active Director profile.',
            'Impossible de supprimer votre propre profil Directeur actif.'
          )
        );
      }

      try {
        await deleteLabMemberProfile({
          targetUid: targetUser.uid,
          actor: {
            uid: profile.uid,
            fullName: profile.fullName,
            role: profile.role,
          },
        });
      } catch (firestoreErr) {
        if (!firebaseUser) {
          updatePreviewState({
            users: allUsers.filter((u) => u.uid !== targetUser.uid),
          });
        } else {
          throw firestoreErr;
        }
      }

      setFeedback({
        type: 'success',
        message: tr(
          `Removed profile "${targetUser.fullName}".`,
          `Profil « ${targetUser.fullName} » supprimé.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleRoleChange = async (
    targetUid: string,
    newRole: UserRole,
    currentStatus: UserStatus
  ) => {
    setFeedback(null);
    try {
      try {
        await updateUserPermissions({
          targetUid,
          role: newRole,
          status: currentStatus,
          laboratoryIds: ['LCSCO'],
        });
      } catch (firestoreErr) {
        if (!firebaseUser) {
          updatePreviewState({
            users: allUsers.map((u) =>
              u.uid === targetUid ? { ...u, role: newRole, laboratoryIds: ['LCSCO'] } : u
            ),
            currentProfile: profile?.uid === targetUid ? { role: newRole } : undefined,
          });
        } else {
          throw firestoreErr;
        }
      }
      setFeedback({
        type: 'success',
        message: tr(
          `Updated role to ${formatRoleLabel(newRole, language)}.`,
          `Rôle mis à jour vers ${formatRoleLabel(newRole, language)}.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleToggleUserStatus = async (targetUser: UserProfile) => {
    setFeedback(null);
    try {
      if (targetUser.uid === profile?.uid) {
        throw new Error(
          tr(
            'Cannot deactivate your own active Director session.',
            'Impossible de désactiver votre propre session Directeur.'
          )
        );
      }
      const nextStatus =
        targetUser.status === UserStatus.DEACTIVATED
          ? UserStatus.ACTIVE
          : UserStatus.DEACTIVATED;

      try {
        await updateUserPermissions({
          targetUid: targetUser.uid,
          role: targetUser.role,
          status: nextStatus,
          laboratoryIds: targetUser.laboratoryIds || ['LCSCO'],
        });
      } catch (firestoreErr) {
        if (!firebaseUser) {
          updatePreviewState({
            users: allUsers.map((u) =>
              u.uid === targetUser.uid ? { ...u, status: nextStatus } : u
            ),
          });
        } else {
          throw firestoreErr;
        }
      }
      setFeedback({
        type: 'success',
        message: tr(
          `Account "${targetUser.fullName}" is now ${nextStatus}.`,
          `Le compte « ${targetUser.fullName} » est maintenant ${nextStatus}.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleAssignTemporaryPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassTarget) return;
    const cleanTemp = resetTempPassword.trim() || 'LCSCO-2026';
    localStorage.setItem(`lcsco_pass_${resetPassTarget.uid}`, cleanTemp);
    localStorage.setItem(`lcsco_must_change_pass_${resetPassTarget.uid}`, 'true');

    if (isPreviewMode) {
      updatePreviewState({
        users: allUsers.map((u) =>
          u.uid === resetPassTarget.uid
            ? { ...u, password: cleanTemp, mustChangePassword: true }
            : u
        ),
      });
    }

    setFeedback({
      type: 'success',
      message: tr(
        `Assigned temporary password "${cleanTemp}" to ${resetPassTarget.fullName}. They must change it on their next login.`,
        `Mot de passe temporaire « ${cleanTemp} » attribué à ${resetPassTarget.fullName}. Il devra être modifié à la prochaine connexion.`
      ),
    });
    setResetPassTarget(null);
  };

  if (!isAdmin) {
    return (
      <div className="p-8 bg-white border border-slate-200 rounded-md text-center space-y-3 max-w-md mx-auto">
        <Lock className="w-6 h-6 text-rose-500 mx-auto" />
        <div className="text-sm font-semibold text-slate-900">
          {tr('Director Access Required', 'Accès réservé au Directeur')}
        </div>
        <p className="text-xs text-slate-600">
          {tr(
            'Only the Director can manage users and roles.',
            'Seul le Directeur peut gérer les utilisateurs et les rôles.'
          )}
        </p>
        <Button variant="primary" onClick={signOut}>
          {tr('Sign Out to Login Page', 'Se déconnecter')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr('Users & Roles', 'Utilisateurs & Rôles')}
        subtitle={tr(
          'Manage laboratory accounts, assign permissions, and review the chemical catalog.',
          'Gérez les comptes du laboratoire, attribuez les rôles et consultez le catalogue chimique.'
        )}
        actions={
          <Button variant="primary" onClick={() => setShowAddUserModal(true)}>
            <Plus className="w-3.5 h-3.5" />
            <span>{tr('Add User', 'Nouvel utilisateur')}</span>
          </Button>
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
            onClick={() => setFeedback(null)}
            className="text-xs font-mono underline cursor-pointer ml-3"
          >
            {tr('Dismiss', 'Fermer')}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('USERS')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            activeTab === 'USERS'
              ? 'bg-slate-900 text-white font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tr('User Accounts', 'Comptes utilisateurs')} ({allUsers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CATALOG')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            activeTab === 'CATALOG'
              ? 'bg-slate-900 text-white font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tr('Chemical Catalog', 'Catalogue chimique')} ({products.length})
        </button>
      </div>

      {activeTab === 'USERS' ? (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Name', 'Nom')}</th>
                  <th className="py-2.5 px-4">E-mail</th>
                  <th className="py-2.5 px-4">{tr('Role', 'Rôle')}</th>
                  <th className="py-2.5 px-4">{tr('Status', 'Statut')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allUsers.map((u) => {
                  const isSelf = u.uid === profile?.uid;
                  const requiresPassChange =
                    Boolean(u.mustChangePassword) ||
                    localStorage.getItem(`lcsco_must_change_pass_${u.uid}`) === 'true';
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div>{u.fullName}</div>
                        {requiresPassChange && (
                          <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-medium text-amber-800">
                            <KeyRound className="w-2.5 h-2.5" />
                            {tr(
                              'Temporary password (change required on 1st login)',
                              'Mot de passe temporaire (changement requis à la 1ère connexion)'
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {u.email}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.uid, e.target.value as UserRole, u.status)
                          }
                          className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-md bg-white"
                        >
                          {LCSCO_FOUR_ACCOUNT_ROLES.map((roleOpt) => (
                            <option key={roleOpt} value={roleOpt}>
                              {formatRoleLabel(roleOpt, language)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            u.status === UserStatus.DEACTIVATED
                              ? 'text-rose-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          <span className="text-[10px]">●</span>
                          <span>
                            {u.status === UserStatus.DEACTIVATED
                              ? tr('Deactivated', 'Désactivé')
                              : tr('Active', 'Actif')}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setResetPassTarget(u);
                                setResetTempPassword(u.password || 'LCSCO-2026');
                              }}
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>{tr('Temp Password', 'Mot de passe temp.')}</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isSelf}
                            onClick={() => handleToggleUserStatus(u)}
                          >
                            {u.status === UserStatus.DEACTIVATED
                              ? tr('Activate', 'Activer')
                              : tr('Deactivate', 'Désactiver')}
                          </Button>
                          <Button
                            size="sm"
                            variant="tertiary"
                            disabled={isSelf}
                            onClick={() => handleRemoveMemberProfile(u)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Chemical Name', 'Nom chimique')}</th>
                  <th className="py-2.5 px-4">{tr('CAS / Formula', 'CAS / Formule')}</th>
                  <th className="py-2.5 px-4">{tr('GHS Hazards', 'Dangers SGH')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Total Stock', 'Stock total')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Min / Reorder', 'Min / Réappro.')}</th>
                  <th className="py-2.5 px-4 text-right">SDS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const totalStock = productAggregateStock.get(p.productId) || 0;
                  return (
                    <tr key={p.productId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {p.chemicalName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {p.casNumber} · {p.formula} ({p.molecularWeight} g/mol)
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-rose-700">
                        {p.hazardClass.join(' · ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {totalStock} {p.defaultUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                        {p.minimumStock} / {p.reorderLevel} {p.defaultUnit}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <a
                          href={p.sdsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1B8A2A] hover:underline inline-flex items-center gap-1 font-mono"
                        >
                          <span>FDS</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-md max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {tr('Create New User Profile', 'Créer un profil utilisateur')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateMemberProfile} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Full Name *', 'Nom complet *')}
                </label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Dr. Meriem Khelifi"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Email *', 'E-mail *')}
                </label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="m.khelifi@lcsco.dz"
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Role *', 'Rôle *')}
                </label>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
                >
                  {LCSCO_FOUR_ACCOUNT_ROLES.map((roleOpt) => (
                    <option key={roleOpt} value={roleOpt}>
                      {formatRoleLabel(roleOpt, language)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Temporary Password *', 'Mot de passe temporaire *')}
                </label>
                <input
                  type="text"
                  required
                  value={newMemberPassword}
                  onChange={(e) => setNewMemberPassword(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
                <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  {tr(
                    'The new user will be required to change this temporary password upon their first login.',
                    'Le nouvel utilisateur devra obligatoirement modifier ce mot de passe temporaire lors de sa première connexion.'
                  )}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddUserModal(false)}
                >
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button type="submit" variant="primary">
                  {tr('Create Profile', 'Créer le profil')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN TEMPORARY PASSWORD MODAL */}
      {resetPassTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-md max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {tr('Set Temporary Password', 'Définir un mot de passe temporaire')}
              </h3>
              <button
                type="button"
                onClick={() => setResetPassTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAssignTemporaryPassword} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <div className="font-semibold text-slate-900">{resetPassTarget.fullName}</div>
                <div className="font-mono text-slate-500">{resetPassTarget.email}</div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Temporary Password *', 'Mot de passe temporaire *')}
                </label>
                <input
                  type="text"
                  required
                  value={resetTempPassword}
                  onChange={(e) => setResetTempPassword(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
                <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  {tr(
                    'This user will be required to set a new personal password on their next login.',
                    'Cet utilisateur devra définir un nouveau mot de passe personnel lors de sa prochaine connexion.'
                  )}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setResetPassTarget(null)}
                >
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button type="submit" variant="primary">
                  {tr('Assign Temporary Password', 'Attribuer le mot de passe temporaire')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
