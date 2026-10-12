/**
 * Chemical Placement & Co-Location Compatibility Engine (`chemicalCompatibilityService.ts`)
 * Supports the physical hierarchy:
 *   Cabinet (CAB 1, CAB 2, CAB 3, CAB 4) -> Level -> Side (Left / Right)
 */

import { ChemicalContainer, Product } from '../types/inventory';

export interface PlacementZonePreset {
  id: string;
  room: string;
  unit: string;
  label: string;
  defaultCondition: string;
  recommendedFor: string;
}

export const LCSCO_PLACEMENT_ZONES: PlacementZonePreset[] = [
  {
    id: 'ZONE-CAB-1',
    room: 'Hallway',
    unit: 'CAB 1',
    label: 'Cabinet 1 - Hallway (Salts Cabinet)',
    defaultCondition: 'CAB 1 — Salts & Inorganic Reagents',
    recommendedFor: 'Salts, Inorganics, Metals, Bases, Reducing & Oxidizing Salts',
  },
  {
    id: 'ZONE-CAB-2',
    room: 'Hallway',
    unit: 'CAB 2',
    label: 'Cabinet 2 - Hallway (Esters, Aldehydes, Ketones, Alcohols, Acids)',
    defaultCondition: 'CAB 2 — Esters, Aldehydes, Ketones, Alcohols, Acids',
    recommendedFor: 'Esters, Aldehydes, Halogenoalkanes, Ketones, Alcohols, Ethers, Carboxylic Acids',
  },
  {
    id: 'ZONE-CAB-3',
    room: 'Hallway',
    unit: 'CAB 3',
    label: 'Cabinet 3 - Hallway (Amines Cabinet)',
    defaultCondition: 'CAB 3 — Amines, Amino Acids & Heterocycles',
    recommendedFor: 'Amines, Aromatic Amines, Amino Acids, Amides, Heterocycles, Bases',
  },
  {
    id: 'ZONE-CAB-4',
    room: 'Synthesis Lab',
    unit: 'CAB 4',
    label: 'Inside Organic Chemistry Synthesis Lab Cabinet',
    defaultCondition: 'CAB 4 — Organic Chemistry Synthesis Lab Cabinet',
    recommendedFor: 'Synthesis Solvents, Aldehydes, Ketones, Esters, Drying Salts',
  },
];

export interface CoLocatedNeighbor {
  containerId: string;
  chemicalName: string;
  formula: string;
  casNumber: string;
  hazardClass: string[];
  storageRequirements: string;
  shelf: string;
  position: string;
}

export interface PlacementConflictItem {
  neighborContainerId: string;
  neighborChemicalName: string;
  neighborFormula: string;
  severity: 'CRITICAL' | 'WARNING';
  reason: string;
}

export interface PlacementCompatibilityReport {
  status: 'COMPATIBLE' | 'CAUTION' | 'INCOMPATIBLE';
  headline: string;
  conflicts: PlacementConflictItem[];
  recommendedZone: string;
  aiGenerated?: boolean;
}

function classifyChemicalProfile(item: {
  chemicalName: string;
  formula: string;
  hazardClass: string[];
  storageRequirements: string;
}) {
  const combined = `${item.chemicalName} ${item.formula} ${item.hazardClass.join(' ')} ${
    item.storageRequirements
  }`.toLowerCase();

  return {
    isFlammable:
      combined.includes('flammable') ||
      combined.includes('ghs02') ||
      combined.includes('acetone') ||
      combined.includes('ethanol') ||
      combined.includes('methanol') ||
      combined.includes('hexane') ||
      combined.includes('toluene') ||
      combined.includes('thf'),
    isWaterReactive:
      combined.includes('water-reactive') ||
      combined.includes('desiccator') ||
      combined.includes('borohydride') ||
      combined.includes('nabh4') ||
      combined.includes('lialh4') ||
      combined.includes('hydride'),
    isPyrophoric:
      combined.includes('pyrophoric') ||
      combined.includes('glovebox') ||
      combined.includes('palladium') ||
      combined.includes('pd/c'),
    isStrongAcid:
      combined.includes('acid') ||
      combined.includes('hcl') ||
      combined.includes('h2so4') ||
      combined.includes('hno3'),
    isStrongBase:
      combined.includes('hydroxide') ||
      combined.includes('naoh') ||
      combined.includes('koh') ||
      combined.includes('base'),
    isOxidizer:
      combined.includes('oxidiz') ||
      combined.includes('ghs03') ||
      combined.includes('permanganate') ||
      combined.includes('peroxide'),
    isHalogenated:
      combined.includes('halogen') ||
      combined.includes('dichloromethane') ||
      combined.includes('chloroform') ||
      combined.includes('ch2cl2'),
  };
}

export function getNeighborsInPlacementBox(
  targetUnit: string,
  containers: ChemicalContainer[],
  productMap: Map<string, Product>,
  excludeContainerId?: string
): CoLocatedNeighbor[] {
  const cleanUnit = targetUnit.trim().toUpperCase();
  if (!cleanUnit) return [];

  return containers
    .filter(
      (c) =>
        c.location.unit.trim().toUpperCase() === cleanUnit &&
        c.containerId !== excludeContainerId
    )
    .map((c) => {
      const prod = productMap.get(c.productId);
      return {
        containerId: c.containerId,
        chemicalName: prod?.chemicalName || c.productId,
        formula: prod?.formula || '',
        casNumber: prod?.casNumber || '',
        hazardClass: prod?.hazardClass || [],
        storageRequirements: prod?.storageRequirements || c.storageCondition,
        shelf: c.location.shelf,
        position: c.location.position,
      };
    });
}

export function evaluateLocalPlacementCompatibility(
  candidate: {
    chemicalName: string;
    formula: string;
    casNumber: string;
    hazardClass: string[];
    storageRequirements: string;
  },
  neighbors: CoLocatedNeighbor[],
  targetUnitLabel: string
): PlacementCompatibilityReport {
  const candFlags = classifyChemicalProfile(candidate);
  const conflicts: PlacementConflictItem[] = [];

  for (const neighbor of neighbors) {
    const neighFlags = classifyChemicalProfile(neighbor);

    if (
      (candFlags.isStrongAcid && neighFlags.isWaterReactive) ||
      (candFlags.isWaterReactive && neighFlags.isStrongAcid)
    ) {
      conflicts.push({
        neighborContainerId: neighbor.containerId,
        neighborChemicalName: neighbor.chemicalName,
        neighborFormula: neighbor.formula,
        severity: 'CRITICAL',
        reason:
          'CRITICAL HAZARD: Strong Acids and Water-Reactive Hydrides liberate explosive H2 gas on contact.',
      });
      continue;
    }

    if (
      (candFlags.isStrongAcid && neighFlags.isStrongBase) ||
      (candFlags.isStrongBase && neighFlags.isStrongAcid)
    ) {
      conflicts.push({
        neighborContainerId: neighbor.containerId,
        neighborChemicalName: neighbor.chemicalName,
        neighborFormula: neighbor.formula,
        severity: 'CRITICAL',
        reason:
          'INCOMPATIBLE CORROSIVES: Acids and Bases must be segregated in separate cabinets (ACID-01 vs BASE-01).',
      });
      continue;
    }

    if (
      (candFlags.isStrongAcid && neighFlags.isFlammable) ||
      (candFlags.isFlammable && neighFlags.isStrongAcid)
    ) {
      conflicts.push({
        neighborContainerId: neighbor.containerId,
        neighborChemicalName: neighbor.chemicalName,
        neighborFormula: neighbor.formula,
        severity: 'CRITICAL',
        reason:
          'INCOMPATIBLE CO-LOCATION: Corrosive Mineral Acids and Flammable Solvents must be segregated.',
      });
      continue;
    }

    if (
      (candFlags.isOxidizer && neighFlags.isFlammable) ||
      (candFlags.isFlammable && neighFlags.isOxidizer)
    ) {
      conflicts.push({
        neighborContainerId: neighbor.containerId,
        neighborChemicalName: neighbor.chemicalName,
        neighborFormula: neighbor.formula,
        severity: 'CRITICAL',
        reason:
          'FIRE / EXPLOSION HAZARD: Oxidizing agents must never be stored in a Flammable Cabinet.',
      });
      continue;
    }
  }

  let recommendedZone = 'CAB 4 (Inside Organic Chemistry Synthesis Lab Cabinet)';
  if (candFlags.isStrongBase) {
    recommendedZone = 'CAB 3 (Cabinet 3 - Hallway — Amines Cabinet)';
  } else if (candFlags.isStrongAcid || candFlags.isFlammable || candFlags.isHalogenated) {
    recommendedZone = 'CAB 2 (Cabinet 2 - Hallway — Esters, Aldehydes, Ketones, Alcohols, Acids)';
  } else if (candFlags.isOxidizer || candFlags.isWaterReactive) {
    recommendedZone = 'CAB 1 (Cabinet 1 - Hallway — Salts Cabinet)';
  }

  const hasCritical = conflicts.some((c) => c.severity === 'CRITICAL');
  const hasWarning = conflicts.some((c) => c.severity === 'WARNING');

  if (hasCritical) {
    return {
      status: 'INCOMPATIBLE',
      headline: `DANGER: ${candidate.chemicalName} is incompatible with ${conflicts.length} item(s) in ${targetUnitLabel}!`,
      conflicts,
      recommendedZone,
    };
  }

  if (hasWarning) {
    return {
      status: 'CAUTION',
      headline: `CAUTION: Secondary segregation advised in ${targetUnitLabel}.`,
      conflicts,
      recommendedZone,
    };
  }

  return {
    status: 'COMPATIBLE',
    headline:
      neighbors.length === 0
        ? `SAFE PLACEMENT: ${targetUnitLabel} is ready for ${candidate.chemicalName}.`
        : `COMPATIBLE: ${candidate.chemicalName} can be safely co-located with the ${neighbors.length} item(s) in ${targetUnitLabel}.`,
    conflicts: [],
    recommendedZone,
  };
}

export function evaluateChemicalPlacementCompatibility(params: {
  candidateProduct: Product | null;
  candidateStorageCondition: string;
  targetUnitCode: string;
  targetShelfCode: string;
  allContainers: ChemicalContainer[];
  allProducts: Product[];
  excludeContainerId?: string;
}): {
  overallSeverity: 'SAFE' | 'WARNING' | 'DANGER';
  boxFitMessage: string;
  alerts: Array<{ id: string; title: string; message: string }>;
} {
  const prodMap = new Map<string, Product>();
  params.allProducts.forEach((p) => prodMap.set(p.productId, p));

  const neighbors = getNeighborsInPlacementBox(
    params.targetUnitCode,
    params.allContainers,
    prodMap,
    params.excludeContainerId
  );

  const candidate = {
    chemicalName: params.candidateProduct?.chemicalName || 'Reagent',
    formula: params.candidateProduct?.formula || '',
    casNumber: params.candidateProduct?.casNumber || '',
    hazardClass: params.candidateProduct?.hazardClass || [],
    storageRequirements:
      params.candidateProduct?.storageRequirements || params.candidateStorageCondition,
  };

  const report = evaluateLocalPlacementCompatibility(
    candidate,
    neighbors,
    params.targetUnitCode
  );

  return {
    overallSeverity:
      report.status === 'INCOMPATIBLE'
        ? 'DANGER'
        : report.status === 'CAUTION'
        ? 'WARNING'
        : 'SAFE',
    boxFitMessage: `${report.headline} (Recommended: ${report.recommendedZone})`,
    alerts: report.conflicts.map((c, idx) => ({
      id: `ALERT-${idx}-${c.neighborContainerId}`,
      title: `${c.neighborChemicalName} (${c.neighborContainerId})`,
      message: c.reason,
    })),
  };
}

export async function analyzePlacementWithGeminiAI(params: {
  candidate: {
    chemicalName: string;
    formula: string;
    casNumber: string;
    hazardClass: string[];
    storageRequirements: string;
  };
  neighbors: CoLocatedNeighbor[];
  placementZone: string;
}): Promise<PlacementCompatibilityReport> {
  const localFallback = evaluateLocalPlacementCompatibility(
    params.candidate,
    params.neighbors,
    params.placementZone
  );

  try {
    const response = await fetch('/api/chemical-compatibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      return localFallback;
    }

    const data = await response.json();
    if (data && data.status && data.headline) {
      return {
        status: data.status,
        headline: data.headline,
        conflicts: Array.isArray(data.conflicts) ? data.conflicts : localFallback.conflicts,
        recommendedZone: data.recommendedZone || localFallback.recommendedZone,
        aiGenerated: true,
      };
    }
    return localFallback;
  } catch {
    return localFallback;
  }
}
