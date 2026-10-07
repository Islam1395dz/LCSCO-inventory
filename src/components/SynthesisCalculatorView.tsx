import React, { useState } from 'react';
import { Calculator, MinusCircle, ShieldAlert } from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ChemicalUnit, ContainerStatus, TransactionType } from '../types/inventory';
import { formatRoleLabel } from '../utils/formatters';
import { calculateWithdrawalMutation } from '../services/inventoryDomain';
import { withdrawChemicalStock } from '../services/inventoryService';
import { parseDisplayError } from '../firebase';

export const SynthesisCalculatorView: React.FC = () => {
  const {
    profile,
    isPreviewMode,
    updatePreviewState,
    products,
    containers,
    transactions,
  } = useInventoryContext();

  const { language, tr } = useLanguage();

  const [selectedProductId, setSelectedProductId] = useState<string>(
    products[2]?.productId || products[0]?.productId || ''
  );
  const [targetMolarity, setTargetMolarity] = useState<string>('0.25');
  const [targetVolumeMl, setTargetVolumeMl] = useState<string>('250');
  const [equivalents, setEquivalents] = useState<string>('1.0');
  const [densityGPerMl, setDensityGPerMl] = useState<string>('0.79');
  const [rxnReference, setRxnReference] = useState<string>(
    'LCSCO Catalytic Synthesis Solution Prep #RXN-109'
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct =
    products.find((p) => p.productId === selectedProductId) || products[0];

  const matchingContainers = containers.filter(
    (c) =>
      c.productId === selectedProduct?.productId &&
      (c.status === ContainerStatus.NORMAL ||
        c.status === ContainerStatus.LOW_STOCK ||
        c.status === ContainerStatus.NEARLY_EMPTY)
  );
  const targetBottle = matchingContainers[0];

  const M = parseFloat(targetMolarity) || 0;
  const V_L = (parseFloat(targetVolumeMl) || 0) / 1000;
  const eq = parseFloat(equivalents) || 1;
  const mw = selectedProduct?.molecularWeight || 0;
  const rho = parseFloat(densityGPerMl) || 1;

  const moles = M * V_L * eq;
  const requiredMassGrams = Math.round(moles * mw * 10000) / 10000;
  const requiredMassMg = Math.round(requiredMassGrams * 1000 * 100) / 100;
  const requiredVolumeMl = rho > 0 ? Math.round((requiredMassGrams / rho) * 10000) / 10000 : 0;

  const amountInBottleUnit = React.useMemo(() => {
    if (!targetBottle) return requiredMassGrams;
    switch (targetBottle.unit) {
      case ChemicalUnit.GRAM:
        return requiredMassGrams;
      case ChemicalUnit.MILLIGRAM:
        return requiredMassMg;
      case ChemicalUnit.KILOGRAM:
        return Math.round((requiredMassGrams / 1000) * 10000) / 10000;
      case ChemicalUnit.MILLILITER:
        return requiredVolumeMl;
      case ChemicalUnit.LITER:
        return Math.round((requiredVolumeMl / 1000) * 10000) / 10000;
    }
  }, [targetBottle, requiredMassGrams, requiredMassMg, requiredVolumeMl]);

  const handleSubtractCalculatedAmount = async () => {
    if (!profile || !targetBottle) return;
    setFeedback(null);
    setSubmitting(true);

    try {
      const calc = calculateWithdrawalMutation(
        targetBottle,
        amountInBottleUnit,
        targetBottle.unit,
        rxnReference
      );

      if (isPreviewMode) {
        const txId = `CALC-${Date.now().toString(36).toUpperCase()}`;
        updatePreviewState({
          containers: containers.map((c) =>
            c.containerId === targetBottle.containerId
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
              userId: profile.uid,
              userName: `${profile.fullName} (${formatRoleLabel(profile.role, language)})`,
              laboratoryId: targetBottle.laboratoryId,
              containerId: targetBottle.containerId,
              productId: targetBottle.productId,
              quantityChange: calc.quantityChange,
              quantityBefore: calc.quantityBefore,
              quantityAfter: calc.quantityAfter,
              unit: targetBottle.unit,
              oldLocation: targetBottle.location.code,
              newLocation: targetBottle.location.code,
              oldStatus: calc.oldStatus,
              newStatus: calc.newStatus,
              reason: `${rxnReference} (${targetMolarity}M, ${targetVolumeMl}mL, ${equivalents} eq)`,
            },
            ...transactions,
          ],
        });
      } else {
        await withdrawChemicalStock({
          containerId: targetBottle.containerId,
          amount: amountInBottleUnit,
          unit: targetBottle.unit,
          reason: `${rxnReference} (${targetMolarity}M, ${targetVolumeMl}mL, ${equivalents} eq)`,
          actor: {
            uid: profile.uid,
            fullName: profile.fullName,
            role: profile.role,
          },
        });
      }

      setFeedback({
        type: 'success',
        message: tr(
          `Subtracted calculated ${amountInBottleUnit} ${targetBottle.unit} from bottle ${targetBottle.containerId}. Remaining stock: ${calc.quantityAfter} ${targetBottle.unit}.`,
          `Quantité calculée de ${amountInBottleUnit} ${targetBottle.unit} soustraite du flacon ${targetBottle.containerId}. Stock restant : ${calc.quantityAfter} ${targetBottle.unit}.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {tr(
            'LCSCO Catalysis & Synthesis Bench Toolkit',
            'Outils de Paillasse Catalyse & Synthèse LCSCO'
          )}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {tr(
            'Interactive Molarity, Stoichiometry & Equivalents Calculator connected directly to LCSCO physical inventory bottles, plus Chemical Storage Compatibility Rules.',
            'Calculateur interactif de Molarité, Stœchiométrie et Équivalents connecté directement aux flacons de l’inventaire LCSCO, ainsi que les règles de compatibilité chimique.'
          )}
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 border rounded-md text-sm flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-mono underline ml-4 cursor-pointer"
          >
            {tr('Dismiss', 'Fermer')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md p-6 space-y-6">
          <div className="border-b border-slate-200 pb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#1B8A2A]" />
            <h2 className="text-base font-bold text-slate-900">
              {tr(
                'Molarity, Stoichiometry & Direct Stock Subtraction',
                'Molarité, Stœchiométrie & Soustraction Directe du Stock'
              )}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                {tr(
                  'Select LCSCO Catalog Reagent or Catalyst',
                  'Sélectionner un Réactif ou Catalyseur du Catalogue LCSCO'
                )}
              </label>
              <select
                value={selectedProduct?.productId || ''}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2.5 font-semibold border border-slate-300 rounded-md bg-white"
              >
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.chemicalName} — {tr('Formula:', 'Formule :')} {p.formula} (MW:{' '}
                    {p.molecularWeight} g/mol)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                {tr(
                  'Target Concentration / Molarity (mol/L)',
                  'Concentration Cible / Molarité (mol/L)'
                )}
              </label>
              <input
                type="number"
                step="any"
                min="0.0001"
                value={targetMolarity}
                onChange={(e) => setTargetMolarity(e.target.value)}
                className="w-full px-3 py-2 font-mono text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                {tr('Reaction / Solution Volume (mL)', 'Volume de la Réaction / Solution (mL)')}
              </label>
              <input
                type="number"
                step="any"
                min="0.1"
                value={targetVolumeMl}
                onChange={(e) => setTargetVolumeMl(e.target.value)}
                className="w-full px-3 py-2 font-mono text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                {tr('Stoichiometric Equivalents (eq.)', 'Équivalents Stœchiométriques (éq.)')}
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={equivalents}
                onChange={(e) => setEquivalents(e.target.value)}
                className="w-full px-3 py-2 font-mono text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                {tr(
                  'Liquid Density (g/mL, if dispensing by volume)',
                  'Densité du Liquide (g/mL, si prélèvement en volume)'
                )}
              </label>
              <input
                type="number"
                step="any"
                min="0.1"
                value={densityGPerMl}
                onChange={(e) => setDensityGPerMl(e.target.value)}
                className="w-full px-3 py-2 font-mono text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                {tr('Reaction Notebook Reference', 'Référence du Cahier de Laboratoire')}
              </label>
              <input
                type="text"
                value={rxnReference}
                onChange={(e) => setRxnReference(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          </div>

          {targetBottle ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs space-y-1">
                <div className="font-mono text-slate-500 uppercase">
                  {tr('Matched Active Bottle:', 'Flacon Actif Associé :')}{' '}
                  <strong className="text-[#1E3A8A]">{targetBottle.containerId}</strong> (
                  {targetBottle.location.code})
                </div>
                <div className="font-mono text-sm text-slate-900">
                  {tr('Current Stock:', 'Stock Actuel :')}{' '}
                  <strong>
                    {targetBottle.currentQuantity} {targetBottle.unit}
                  </strong>{' '}
                  &rarr; {tr('After Subtraction:', 'Après Soustraction :')}{' '}
                  <strong className="text-[#1B8A2A]">
                    {Math.round((targetBottle.currentQuantity - amountInBottleUnit) * 10000) /
                      10000}{' '}
                    {targetBottle.unit}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSubtractCalculatedAmount}
                disabled={
                  submitting ||
                  amountInBottleUnit <= 0 ||
                  amountInBottleUnit > targetBottle.currentQuantity
                }
                className="px-4 py-2.5 text-xs font-semibold text-white bg-[#1B8A2A] rounded-md hover:bg-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <MinusCircle className="w-4 h-4" />
                <span>
                  {tr('Subtract', 'Soustraire')} {amountInBottleUnit} {targetBottle.unit}{' '}
                  {tr('from', 'de')} {targetBottle.containerId}
                </span>
              </button>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
              {tr(
                'No unlocked physical container currently in stock for this reagent.',
                'Aucun flacon physique déverrouillé actuellement en stock pour ce réactif.'
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-900 text-white border border-slate-800 rounded-md p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              {tr('Calculated Bench Dispense Values', 'Valeurs de Prélèvement Calculées')}
            </div>

            <div className="pt-2 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                {tr('Required Mass (Grams)', 'Masse Requise (Grammes)')}
              </div>
              <div className="text-3xl font-mono font-bold tabular-nums text-white mt-1">
                {requiredMassGrams} <span className="text-sm text-emerald-400">g</span>
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5">({requiredMassMg} mg)</div>
            </div>

            <div className="pt-3 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                {tr(
                  `Equivalent Liquid Volume (at ${rho} g/mL)`,
                  `Volume Liquide Équivalent (à ${rho} g/mL)`
                )}
              </div>
              <div className="text-2xl font-mono font-bold tabular-nums text-white mt-1">
                {requiredVolumeMl} <span className="text-sm text-blue-400">mL</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                {tr('Total Moles (n = C · V · eq)', 'Nombre Total de Moles (n = C · V · éq)')}
              </div>
              <div className="text-lg font-mono font-semibold tabular-nums text-slate-200 mt-1">
                {(moles * 1000).toFixed(2)} mmol ({moles.toFixed(5)} mol)
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            {tr('Formula:', 'Formule :')} m = C × V(L) × eq × MW ({mw} g/mol)
          </div>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-md p-6 space-y-4">
        <div className="border-b border-slate-200 pb-3 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#1E3A8A]" />
          <h2 className="text-base font-bold text-slate-900">
            {tr(
              'LCSCO Chemical Storage Segregation & Compatibility Guide',
              'Guide de Ségrégation et Compatibilité du Stockage Chimique LCSCO'
            )}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-4 border border-slate-200 rounded-md space-y-1.5">
            <div className="font-mono font-bold text-amber-700">
              {tr('▲ FLAMMABLE SOLVENTS (FLAM-A)', '▲ SOLVANTS INFLAMMABLES (FLAM-A)')}
            </div>
            <p className="text-slate-600">
              {tr(
                'Acetone, THF, Hexane, EtOAc, EtOH. Store in grounded explosion-proof cabinet away from oxidizers and nitric/perchloric acids.',
                'Acétone, THF, Hexane, EtOAc, EtOH. Stocker dans une armoire anti-déflagrante loin des oxydants et des acides nitrique/perchlorique.'
              )}
            </p>
          </div>

          <div className="p-4 border border-slate-200 rounded-md space-y-1.5">
            <div className="font-mono font-bold text-blue-800">
              {tr('◆ HALOGENATED SOLVENTS (HALO-B)', '◆ SOLVANTS HALOGÉNÉS (HALO-B)')}
            </div>
            <p className="text-slate-600">
              {tr(
                'Dichloromethane (DCM), Chloroform. Segregate from alkali metals (Na, K, Li) and strong bases to prevent exothermic reactions.',
                'Dichlorométhane (DCM), Chloroforme. Séparer des métaux alcalins (Na, K, Li) et des bases fortes pour éviter les réactions exothermiques.'
              )}
            </p>
          </div>

          <div className="p-4 border border-slate-200 rounded-md space-y-1.5">
            <div className="font-mono font-bold text-rose-700">
              {tr('✖ WATER-REACTIVE & HYDRIDES (DESC-1)', '✖ HYDRO-RÉACTIFS & HYDRURES (DESC-1)')}
            </div>
            <p className="text-slate-600">
              {tr(
                'NaBH4, LiAlH4, NaH. Strictly isolate from aqueous acids and humid air inside dry N2 desiccator cabinets.',
                'NaBH4, LiAlH4, NaH. Isoler strictement des acides aqueux et de l’humidité dans un dessiccateur sous azote sec.'
              )}
            </p>
          </div>

          <div className="p-4 border border-slate-200 rounded-md space-y-1.5">
            <div className="font-mono font-bold text-emerald-800">
              {tr('● PYROPHORIC CATALYSTS (GLOVE-1)', '● CATALYSEURS PYROPHORIQUES (GLOVE-1)')}
            </div>
            <p className="text-slate-600">
              {tr(
                'Pd/C, Raney Nickel, organometallics. Store under inert Argon atmosphere; never filter dry Pd/C in air with flammable alcohol vapors.',
                'Pd/C, Nickel de Raney, organométalliques. Stocker sous atmosphère d’Argon inerte ; ne jamais filtrer le Pd/C à sec à l’air libre.'
              )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
