/**
 * Chemical Placement & Co-Location Compatibility Engine (`chemicalCompatibilityService.ts`)
 * Supports the physical hierarchy:
 *   Room -> Cabinet -> Side (Left / Right) -> Shelf -> Position
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
    id: 'ZONE-FLAM-01',
    room: '204',
    unit: 'FLAM-01',
    label: 'Flammable Cabinet',
    defaultCondition: 'Flammable Cabinet (15-25°C, Grounded)',
    recommendedFor: 'Ketones, Alcohols, Esters, Ethers, Hydrocarbons, Aromatic Solvents',
  },
  {
    id: 'ZONE-CAB-02',
    room: '204',
    unit: 'CAB-02',
    label: 'General Organic Synthesis Cabinet',
    defaultCondition: 'Ambient Dry Synthesis Cabinet (20°C)',
    recommendedFor: 'Salts, Aldehydes, Heterocycles, Indicators, Polymers, Surfactants',
  },
  {
    id: 'ZONE-HALO-01',
    room: '204',
    unit: 'HALO-01',
    label: 'Ventilated Halogenated Solvent Cabinet',
    defaultCondition: 'Ventilated Halogenated Solvent Extraction Cabinet',
    recommendedFor: 'Dichloromethane, Chloroform, Halogenated Compounds',
  },
  {
    id: 'ZONE-ACID-01',
    room: '308',
    unit: 'ACID-01',
    label: 'Polyethylene Acid Corrosives Cabinet',
    defaultCondition: 'HDPE Corrosion-Proof Acid Cabinet',
    recommendedFor: 'Mineral Acids (HCl, H2SO4, HNO3) & Carboxylic Acids',
  },
  {
    id: 'ZONE-BASE-01',
    room: '308',
    unit: 'BASE-01',
    label: 'Corrosive Base & Caustics Cabinet',
    defaultCondition: 'Dedicated Alkaline Corrosives Cabinet',
    recommendedFor: 'Sodium Hydroxide, Potassium Hydroxide, Inorganic Bases',
  },
  {
    id: 'ZONE-DESC-01',
    room: '204',
    unit: 'DESC-01',
    label: 'Dry Nitrogen Desiccator Cabinet',
    defaultCondition: 'Dry N2 Purge Desiccator (RH < 5%)',
    recommendedFor: 'Reducing Agents (NaBH4, LiAlH4) & Water-Reactive Hydrides',
  },
  {
    id: 'ZONE-GLOVE-01',
    room: '101',
    unit: 'GLOVE-01',
    label: 'Inert Argon Glovebox (<0.5 ppm O2)',
    defaultCondition: 'Inert Argon Glovebox (< 0.5 ppm O2 / H2O)',
    recommendedFor: 'Organometallic Catalysts (Pd/C, Pd(PPh3)4) & Pyrophorics',
  },
  {
    id: 'ZONE-OXID-01',
    room: '308',
    unit: 'OXID-01',
    label: 'Dedicated Oxidizer Safety Cabinet',
    defaultCondition: 'Segregated Inorganic Oxidizer Cabinet',
    recommendedFor: 'Permanganates, Peroxides, Nitrates & Oxidizing Agents',
  },
  {
    id: 'ZONE-COLD-01',
    room: '101',
    unit: 'COLD-01',
    label: 'Explosion-Proof Cold Storage (+4°C / -20°C)',
    defaultCondition: 'ATEX Explosion-Proof Refrigerator (+4°C)',
    recommendedFor: 'Buffers, Thermolabile Reagents & Monomers',
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

  let recommendedZone = 'CAB-02 (Room 204 — General Organic Synthesis Cabinet)';
  if (candFlags.isPyrophoric) {
    recommendedZone = 'GLOVE-01 (Room 101 — Inert Argon Glovebox)';
  } else if (candFlags.isWaterReactive) {
    recommendedZone = 'DESC-01 (Room 204 — Dry Nitrogen Desiccator)';
  } else if (candFlags.isStrongAcid) {
    recommendedZone = 'ACID-01 (Room 308 — Polyethylene Acid Cabinet)';
  } else if (candFlags.isStrongBase) {
    recommendedZone = 'BASE-01 (Room 308 — Corrosive Base Cabinet)';
  } else if (candFlags.isOxidizer) {
    recommendedZone = 'OXID-01 (Room 308 — Oxidizer Safety Cabinet)';
  } else if (candFlags.isHalogenated) {
    recommendedZone = 'HALO-01 (Room 204 — Ventilated Halogenated Solvent Cabinet)';
  } else if (candFlags.isFlammable) {
    recommendedZone = 'FLAM-01 (Room 204 — Flammable Cabinet)';
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
