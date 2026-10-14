import {
  AppNotification,
  ChemicalClassification,
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  DisposalWorkflowItem,
  InventoryTransaction,
  PhysicalLocationConfig,
  Product,
  PurchaseWorkflowItem,
  StockAdjustmentRequest,
  StockRuptureRequest,
  StorageClassification,
} from '../types/inventory';
import {
  PDF21_CONTAINERS,
  PDF21_PHYSICAL_LOCATIONS,
  PDF21_PRODUCTS,
} from './pdf21PagesData';

/**
 * Physical Laboratory Cabinets & Hierarchical Storage Definitions
 * Strictly based on the attached PDF Inventory:
 * - CAB 1: Cabinet 1 - Hallway (Salts Cabinet)
 * - CAB 2: Cabinet 2 - Hallway (Esters, Aldehydes, Ketones, Alcohols, Acids & Unidentified)
 * - CAB 3: Cabinet 3 - Hallway (Amines Cabinet)
 * - CAB 4: Inside Organic Chemistry Synthesis lab Cabinet
 * Plus the 21-page official LCSCO laboratory locations (Armoires, Frigos, Paillasses)
 */
const BASE_PHYSICAL_LOCATIONS: PhysicalLocationConfig[] = [
  {
    id: 'CAB-1',
    room: 'Hallway',
    cabinet: 'CAB 1',
    cabinetLabel: 'Cabinet 1 - Hallway (Salts Cabinet)',
    storageClassification: 'General storage',
    sides: ['Left', 'Right'],
    shelves: ['1', '2', '3', '4', '5'],
    positions: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
    reagentClasses: ['Salts', 'Inorganics', 'Metals', 'Bases'],
  },
  {
    id: 'CAB-2',
    room: 'Hallway',
    cabinet: 'CAB 2',
    cabinetLabel: 'Cabinet 2 - Hallway (Esters, Aldehydes, Ketones, Alcohols, Acids)',
    storageClassification: 'Flammable solvent',
    sides: ['Left', 'Right'],
    shelves: ['2', '3', '5'],
    positions: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
    reagentClasses: ['Esters', 'Aldehydes', 'Halogenated compounds', 'Ketones', 'Alcohols', 'Ethers', 'Acids', 'Carboxylic acids'],
  },
  {
    id: 'CAB-3',
    room: 'Hallway',
    cabinet: 'CAB 3',
    cabinetLabel: 'Cabinet 3 - Hallway (Amines Cabinet)',
    storageClassification: 'Corrosive base',
    sides: ['Left', 'Right'],
    shelves: ['1', '2', '3'],
    positions: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
    reagentClasses: ['Amines', 'Amides', 'Heterocycles', 'Bases'],
  },
  {
    id: 'CAB-4',
    room: 'Synthesis Lab',
    cabinet: 'CAB 4',
    cabinetLabel: 'Inside Organic Chemistry Synthesis Lab Cabinet',
    storageClassification: 'General synthesis cabinet',
    sides: ['Left', 'Right'],
    shelves: ['1', '2', '3'],
    positions: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
    reagentClasses: ['Solvents', 'Salts', 'Aldehydes', 'Ketones', 'Esters', 'Acids'],
  },
];

interface RawPdfReagentRow {
  cabinet: 'CAB 1' | 'CAB 2' | 'CAB 3' | 'CAB 4';
  level: string;
  side: 'Left' | 'Right';
  pos: number;
  name: string;
  cas: string;
  qty: number;
  initQty?: number;
  unit: ChemicalUnit;
  group: ChemicalClassification;
  note?: string;
  needsId?: boolean;
}

const PDF_INVENTORY_ROWS: RawPdfReagentRow[] = [
  // =========================================================================
  // CABINET 2 - HALLWAY
  // 1. Level N°2: Esters (Right side)
  // =========================================================================
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 1, name: 'Ethyl acetate', cas: '141-78-6', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Esters' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 2, name: 'Methyl benzoate', cas: '93-58-3', qty: 300, unit: ChemicalUnit.GRAM, group: 'Esters' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 3, name: 'Diethyl malonate', cas: '105-53-3', qty: 250, unit: ChemicalUnit.MILLILITER, group: 'Esters' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 4, name: 'Hydroxybenzoyl propyl', cas: '—', qty: 20, unit: ChemicalUnit.GRAM, group: 'Esters', note: 'Name needs verification', needsId: true },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 5, name: 'Coumarin', cas: '91-64-5', qty: 20, unit: ChemicalUnit.GRAM, group: 'Esters' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 6, name: 'Phthalide', cas: '87-41-2', qty: 20, unit: ChemicalUnit.GRAM, group: 'Esters' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 7, name: 'Sodium benzoate', cas: '532-32-1', qty: 20, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 8, name: 'Cinnamyl acetate', cas: '103-54-8', qty: 0, initQty: 100, unit: ChemicalUnit.GRAM, group: 'Esters', note: 'No stock indicated' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 9, name: 'Methyl salicylate', cas: '119-36-8', qty: 100, unit: ChemicalUnit.MILLILITER, group: 'Esters' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 10, name: 'Ethoxycarbonyl compound', cas: '—', qty: 20, unit: ChemicalUnit.MILLILITER, group: 'Esters', note: 'Exact compound needs verification', needsId: true },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 11, name: '2-Bromomethyl benzoate', cas: '—', qty: 30, unit: ChemicalUnit.MILLILITER, group: 'Esters', note: 'Name needs verification', needsId: true },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 12, name: 'Diethyl malonate (Bottle 2)', cas: '105-53-3', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Esters', note: 'Separate entry' },

  // =========================================================================
  // CABINET 2 - HALLWAY
  // 2. Level N°02: Aldehydes / Halogenoalkanes (Left side)
  // =========================================================================
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 1, name: 'Salicylaldehyde', cas: '90-02-8', qty: 300, unit: ChemicalUnit.MILLILITER, group: 'Aldehydes' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 2, name: 'Formaldehyde solution (35%)', cas: '50-00-0', qty: 400, unit: ChemicalUnit.MILLILITER, group: 'Aldehydes', note: 'Formol 35%' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 3, name: 'Cinnamaldehyde', cas: '104-55-2', qty: 100, unit: ChemicalUnit.MILLILITER, group: 'Aldehydes' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 4, name: 'Citral (95%)', cas: '5392-40-5', qty: 250, unit: ChemicalUnit.MILLILITER, group: 'Aldehydes', note: 'CAS formatting corrected provisionally' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 5, name: 'Triphenylphosphoranylidene acetaldehyde', cas: '2136-75-6', qty: 10, unit: ChemicalUnit.GRAM, group: 'Aldehydes', note: 'Verify exact name' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 6, name: 'Benzaldehyde', cas: '100-52-7', qty: 50, unit: ChemicalUnit.MILLILITER, group: 'Aldehydes' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 7, name: 'Acrolein', cas: '107-02-8', qty: 50, unit: ChemicalUnit.MILLILITER, group: 'Aldehydes' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 8, name: 'Benzyl chloride', cas: '100-44-7', qty: 250, unit: ChemicalUnit.MILLILITER, group: 'Halogenated compounds' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 9, name: 'Benzyl bromide', cas: '100-39-0', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Halogenated compounds' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 10, name: '2-Bromopropane', cas: '75-26-3', qty: 80, unit: ChemicalUnit.GRAM, group: 'Halogenated compounds' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 11, name: '1-Bromobutane', cas: '109-65-9', qty: 300, unit: ChemicalUnit.MILLILITER, group: 'Halogenated compounds' },
  { cabinet: 'CAB 2', level: '2', side: 'Left', pos: 12, name: 'Bromoethane', cas: '74-96-4', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Halogenated compounds' },

  // =========================================================================
  // CABINET 2 - HALLWAY
  // 3. Level N°02: Ketones + Esters (Right side)
  // =========================================================================
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 13, name: 'Diacetyl monoxime', cas: '57-71-6', qty: 150, unit: ChemicalUnit.GRAM, group: 'Ketones' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 14, name: 'Benzophenone', cas: '119-61-9', qty: 100, unit: ChemicalUnit.GRAM, group: 'Ketones', note: 'Quantity not specified in PDF' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 15, name: '2-Butanone (99%)', cas: '78-93-3', qty: 600, unit: ChemicalUnit.MILLILITER, group: 'Ketones' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 16, name: '2-Hexanone', cas: '591-78-6', qty: 800, unit: ChemicalUnit.MILLILITER, group: 'Ketones' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 17, name: '4-Hydroxy-4-methyl-2-pentanone (Diacetone alcohol)', cas: '123-42-2', qty: 50, unit: ChemicalUnit.MILLILITER, group: 'Ketones', note: 'Common name: diacetone alcohol' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 18, name: '3-Methoxy-3-methyl-2-butanone (95%)', cas: '115-22-0', qty: 50, unit: ChemicalUnit.MILLILITER, group: 'Ketones', note: 'CAS/name mismatch possible; verify label' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 19, name: '2,3-Butanedione', cas: '431-03-8', qty: 0, initQty: 100, unit: ChemicalUnit.MILLILITER, group: 'Ketones', note: 'No stock indicated' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 20, name: 'Dibenzalacetone', cas: '538-58-9', qty: 200, unit: ChemicalUnit.GRAM, group: 'Ketones' },
  { cabinet: 'CAB 2', level: '2', side: 'Right', pos: 21, name: 'Benzoin', cas: '119-53-9', qty: 80, unit: ChemicalUnit.GRAM, group: 'Ketones' },

  // =========================================================================
  // CABINET 2 - HALLWAY
  // 4. Level 03: Alcohols + Ethers (Right side)
  // =========================================================================
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 1, name: 'Benzyl alcohol (95%)', cas: '100-51-6', qty: 1000, unit: ChemicalUnit.MILLILITER, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 2, name: 'Butyl alcohol', cas: '71-36-3', qty: 200, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Isomer unspecified' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 3, name: 'Diethylene glycol', cas: '111-46-6', qty: 1000, unit: ChemicalUnit.MILLILITER, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 4, name: '1-Nonanol', cas: '143-08-8', qty: 1600, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: '500 mL x 2 + 600 mL (Three containers)' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 5, name: '1,6-Hexanediol', cas: '629-11-8', qty: 250, unit: ChemicalUnit.GRAM, group: 'Alcohols', note: 'Quantity not specified in PDF' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 6, name: 'Dodecanol', cas: '112-53-8', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 7, name: 'Neopentyl glycol diglycidyl ether', cas: '17557-23-2', qty: 300, unit: ChemicalUnit.MILLILITER, group: 'Ethers', note: 'Name needs verification' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 8, name: 'Sorbitol', cas: '50-70-4', qty: 100, unit: ChemicalUnit.GRAM, group: 'Alcohols', note: 'Solid' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 9, name: 'Anisyl alcohol', cas: '105-13-5', qty: 600, unit: ChemicalUnit.MILLILITER, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 10, name: '2-Methyl-1-butanol', cas: '137-32-6', qty: 200, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Assumed from supplied name' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 11, name: '2-Phenylethanol', cas: '60-12-8', qty: 80, unit: ChemicalUnit.MILLILITER, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 12, name: 'Oleyl alcohol', cas: '143-28-2', qty: 300, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Assumed from "oleic alcohol"' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 13, name: 'Glycidol', cas: '556-52-5', qty: 100, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Quantity not specified' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 14, name: 'Diisopropyl ether', cas: '108-20-3', qty: 400, unit: ChemicalUnit.MILLILITER, group: 'Ethers', note: '2 x 200 mL (Two containers)' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 15, name: 'Isopropylidene glycol (Solketal)', cas: '100-79-8', qty: 400, unit: ChemicalUnit.GRAM, group: 'Alcohols', note: 'Name/CAS combination needs verification' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 16, name: 'Lauryl alcohol', cas: '112-53-8', qty: 150, unit: ChemicalUnit.MILLILITER, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 17, name: 'Ethanol', cas: '64-17-5', qty: 700, unit: ChemicalUnit.MILLILITER, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 18, name: 'tert-Butanol', cas: '75-65-0', qty: 100, unit: ChemicalUnit.MILLILITER, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 19, name: 'Pyrogallol', cas: '87-66-1', qty: 500, unit: ChemicalUnit.GRAM, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '3', side: 'Right', pos: 20, name: '3,5-Dimethoxybenzyl chloride', cas: '877-88-3', qty: 0, initQty: 100, unit: ChemicalUnit.GRAM, group: 'Halogenated compounds', note: 'No stock indicated' },

  // =========================================================================
  // CABINET 2 - HALLWAY
  // 5. Level 03: Acids (Left side)
  // =========================================================================
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 1, name: 'Formic acid', cas: '64-18-6', qty: 900, unit: ChemicalUnit.MILLILITER, group: 'Carboxylic acids', note: '700 mL + 200 mL (Two containers)' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 2, name: 'o-Toluic acid (99%)', cas: '118-90-1', qty: 250, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 3, name: 'L-(+)-Aspartic acid', cas: '56-84-8', qty: 250, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 4, name: '3,4-Dichlorophenylacetic acid (98%)', cas: '5807-30-7', qty: 10, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 5, name: 'Gallic acid monohydrate (98%)', cas: '5995-86-8', qty: 20, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 6, name: 'Lactic acid (90%)', cas: '50-21-5', qty: 800, unit: ChemicalUnit.MILLILITER, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 7, name: 'Methacrylic acid', cas: '79-41-4', qty: 400, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 8, name: 'Cinnamic acid', cas: '140-10-3', qty: 120, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids', note: '20 g + 100 g (Two containers)' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 9, name: 'Maleic acid', cas: '110-16-7', qty: 800, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 10, name: 'Phenylacetic acid', cas: '103-82-2', qty: 400, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 11, name: 'Glycerine (glycerol)', cas: '56-81-5', qty: 0, initQty: 500, unit: ChemicalUnit.GRAM, group: 'Alcohols', note: 'No stock indicated' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 12, name: 'Acrylic acid (98%)', cas: '79-10-7', qty: 5, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids', note: 'Verify quantity and concentration' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 13, name: 'Phosphoric acid', cas: '7664-38-2', qty: 700, unit: ChemicalUnit.MILLILITER, group: 'Acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 14, name: 'Salicylic acid', cas: '69-72-7', qty: 900, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 15, name: 'Benzoic acid', cas: '65-85-0', qty: 900, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 16, name: 'Phosphorous acid (50%)', cas: '13598-36-2', qty: 700, unit: ChemicalUnit.MILLILITER, group: 'Acids', note: 'Verify concentration and label' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 17, name: 'Ethylenediaminetetraacetic acid (EDTA)', cas: '60-00-4', qty: 50, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 18, name: 'o-Anisic acid (99%)', cas: '579-75-9', qty: 40, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 19, name: 'O-phosphoric acid', cas: '7664-38-2', qty: 800, unit: ChemicalUnit.MILLILITER, group: 'Acids', note: 'Exact identity needs verification' },
  { cabinet: 'CAB 2', level: '3', side: 'Left', pos: 20, name: 'Phenylacetic acid (Bottle 2)', cas: '103-82-2', qty: 100, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids', note: 'Second entry; quantity unknown' },

  // =========================================================================
  // CABINET 2 - HALLWAY
  // 6. Level 05: Left side (Products non identified)
  // =========================================================================
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 1, name: 'Lithium carbonate', cas: '554-13-2', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 2, name: 'Starch (Amidon)', cas: '9005-25-8', qty: 250, unit: ChemicalUnit.GRAM, group: 'Other', note: 'Amidon' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 3, name: 'D-(+)-Glucose', cas: '50-99-7', qty: 200, unit: ChemicalUnit.GRAM, group: 'Other' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 4, name: '2-Methylpentane', cas: '107-83-5', qty: 400, unit: ChemicalUnit.MILLILITER, group: 'Hydrocarbons', note: 'Verify isomer on label' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 5, name: 'Aluminium chloride (AlCl3)', cas: '7446-70-0', qty: 600, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Hydration state unspecified' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 6, name: 'Thioanisole', cas: '100-68-5', qty: 50, unit: ChemicalUnit.GRAM, group: 'Sulfur compounds', note: 'Verify quantity/unit' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 7, name: 'Sodium methyl 4-hydroxybenzoate', cas: '5026-62-0', qty: 5000, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Exact chemical name needs verification' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 8, name: 'DL-Methionine', cas: '59-51-8', qty: 5000, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 9, name: 'Orthoboric acid (boric acid)', cas: '10043-35-3', qty: 600, unit: ChemicalUnit.GRAM, group: 'Acids', note: 'Original name: "Acid ortho borid"' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 10, name: 'm-Cresol', cas: '108-39-4', qty: 800, unit: ChemicalUnit.GRAM, group: 'Alcohols' },
  { cabinet: 'CAB 2', level: '5', side: 'Left', pos: 11, name: 'Potassium (Kalium)', cas: '7440-09-7', qty: 600, unit: ChemicalUnit.GRAM, group: 'Metals', note: 'Confirm chemical form and storage', needsId: true },

  // =========================================================================
  // CABINET 1 - HALLWAY (Salts Cabinet)
  // 1. Étage : 01 Left
  // =========================================================================
  { cabinet: 'CAB 1', level: '1', side: 'Left', pos: 1, name: 'Copper chloride', cas: '7447-39-4', qty: 10, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Exact form unspecified' },
  { cabinet: 'CAB 1', level: '1', side: 'Left', pos: 2, name: 'HBTU', cas: '94790-37-1', qty: 10, unit: ChemicalUnit.GRAM, group: 'Other' },
  { cabinet: 'CAB 1', level: '1', side: 'Left', pos: 3, name: 'Magnesium sulfate', cas: '7487-88-9', qty: 550, unit: ChemicalUnit.GRAM, group: 'Salts', note: '50 g + 500 g (Two quantities recorded)' },
  { cabinet: 'CAB 1', level: '1', side: 'Left', pos: 4, name: 'Phenylhydrazine compound', cas: '100-63-0', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Original name unclear', needsId: true },

  // =========================================================================
  // CABINET 1 - HALLWAY (Salts Cabinet)
  // 2. Étage 02 : Left
  // =========================================================================
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 1, name: 'Triphenylphosphine', cas: '603-35-0', qty: 500, unit: ChemicalUnit.GRAM, group: 'Phosphorus compounds' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 2, name: 'Lithium compound ("Lithium riben")', cas: '—', qty: 25, unit: ChemicalUnit.GRAM, group: 'Metals', note: 'Identity needs verification', needsId: true },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 3, name: 'Barium chloride', cas: '10361-37-2', qty: 10, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 4, name: 'Calcium oxide', cas: '1305-78-8', qty: 150, unit: ChemicalUnit.GRAM, group: 'Inorganics' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 5, name: 'Sodium azide (NNa3)', cas: '26628-22-8', qty: 10, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Formula and label need verification' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 6, name: 'Tin(II) chloride', cas: '7772-99-8', qty: 50, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Hydration state needs verification' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 7, name: 'Cadmium nitrate', cas: '10325-94-7', qty: 100, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Exact form unspecified' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 8, name: 'Methyl orange', cas: '547-58-0', qty: 10, unit: ChemicalUnit.GRAM, group: 'Indicators' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 9, name: 'Calcium nitrate', cas: '10124-37-5', qty: 500, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Manufacturer: Merck' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 10, name: 'Manganese carbonate', cas: '598-62-9', qty: 250, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 11, name: 'Lithium aluminium hydride (LiAlH4)', cas: '16853-85-3', qty: 20, unit: ChemicalUnit.GRAM, group: 'Reducing agents', note: 'Review label and storage' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 12, name: 'Copper(II) sulfate pentahydrate', cas: '7758-99-8', qty: 5, initQty: 100, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Traces' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 13, name: 'Ammonium oxalate', cas: '6009-70-7', qty: 250, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 14, name: 'Phosphorus tribromide (97%)', cas: '7789-60-8', qty: 100, unit: ChemicalUnit.MILLILITER, group: 'Halogenated compounds' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 15, name: 'Potassium iodate', cas: '7758-05-6', qty: 250, unit: ChemicalUnit.GRAM, group: 'Oxidizing agents' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 16, name: 'Iodic acid (HIO3)', cas: '7782-68-5', qty: 25, unit: ChemicalUnit.GRAM, group: 'Acids' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 17, name: 'Lithium amide (NH2Li)', cas: '7782-89-0', qty: 2, unit: ChemicalUnit.GRAM, group: 'Bases', note: 'Original entries "NH2 Li" and "lithium amide"' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 18, name: 'Potassium nitrate (KNO3)', cas: '7757-79-1', qty: 200, unit: ChemicalUnit.GRAM, group: 'Oxidizing agents', note: 'Original CAS needs verification' },
  { cabinet: 'CAB 1', level: '2', side: 'Left', pos: 19, name: 'Chloroacetic anhydride', cas: '541-88-8', qty: 30, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids', note: 'Verify exact chemical identity' },

  // =========================================================================
  // CABINET 1 - HALLWAY (Salts Cabinet)
  // 3. Étage 03 : Left
  // =========================================================================
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 1, name: 'Magnesium', cas: '7439-95-4', qty: 300, unit: ChemicalUnit.GRAM, group: 'Metals' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 2, name: 'Potassium aluminium sulfate', cas: '7784-24-9', qty: 500, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Humid' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 3, name: 'Sodium carbonate', cas: '497-19-8', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 4, name: 'Ammonium fluoride', cas: '12125-01-8', qty: 50, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Humid' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 5, name: 'Tetrabutylammonium iodide', cas: '311-28-4', qty: 10, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 6, name: 'Potassium hexafluorophosphate', cas: '17084-13-8', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Humid' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 7, name: 'Zinc sulfate', cas: '7733-02-0', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Humid' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 8, name: 'o-Phenylenediamine / sodium sulfate anhydrous', cas: '95-54-5', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Original record lists two chemicals together' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 9, name: 'Magnesium compound ("magnesium nate")', cas: '—', qty: 50, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Identity needs verification', needsId: true },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 10, name: 'Chromium(III) chloride hexahydrate', cas: '10060-12-5', qty: 100, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Manufacturer: Merck; humid' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 11, name: 'Cobalt(II) sulfate heptahydrate', cas: '10026-24-1', qty: 30, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 12, name: 'Zinc powder', cas: '7440-66-6', qty: 270, unit: ChemicalUnit.GRAM, group: 'Metals', note: '70 g + 200 g (Two quantities recorded)' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 13, name: 'Zinc powder (1 kg)', cas: '7440-66-6', qty: 1000, unit: ChemicalUnit.GRAM, group: 'Metals', note: 'Separate entry' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 14, name: 'Zinc granules ("zinc morceau")', cas: '7440-66-6', qty: 250, unit: ChemicalUnit.GRAM, group: 'Metals', note: 'Manufacturer: Riedel-de Haën; humid' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 15, name: 'Mercury(I) chloride (calomel)', cas: '10112-91-1', qty: 170, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Original name: "mercrus chloride"; verify label' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 16, name: 'Sodium sulfate, dibasic?', cas: '7757-82-6', qty: 500, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Original entry: "Codium Sulfat 2"', needsId: true },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 17, name: 'Copper(I) chloride, anhydrous', cas: '7758-89-6', qty: 50, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 18, name: 'Copper(II) nitrate trihydrate', cas: '10031-43-3', qty: 50, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 19, name: 'Sodium thiosulfate, anhydrous', cas: '7772-98-7', qty: 500, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 20, name: 'Ammonium hexafluorophosphate', cas: '16941-11-0', qty: 550, unit: ChemicalUnit.GRAM, group: 'Salts', note: '250 g + 300 g' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 21, name: 'Ammonium hydroxide (34%)', cas: '1336-21-6', qty: 1500, unit: ChemicalUnit.MILLILITER, group: 'Bases', note: '500 mL + 1 L' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 22, name: 'Copper(II) chloride (Étage 03)', cas: '7447-39-4', qty: 10, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Separate entry from Étage 01' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 23, name: 'Sodium acetate trihydrate', cas: '6131-90-4', qty: 600, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 24, name: 'Sodium bicarbonate', cas: '144-55-8', qty: 700, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 25, name: 'Zinc chloride', cas: '7646-85-7', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 26, name: 'Copper(II) chloride dihydrate', cas: '10125-13-0', qty: 100, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 27, name: 'Ammonium potassium persulfate (97%)', cas: '7727-21-1', qty: 100, unit: ChemicalUnit.GRAM, group: 'Oxidizing agents', note: 'Quantity absent; verify exact salt' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 28, name: 'Thiocyanate compound (Potassium thiocyanate)', cas: '1762-95-4', qty: 250, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Likely potassium thiocyanate; verify label' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 29, name: 'Potassium persulfate (CAS 7727-21-1)', cas: '7727-21-1', qty: 20, unit: ChemicalUnit.GRAM, group: 'Oxidizing agents', note: 'Unnamed compound in list; check bottle', needsId: true },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 30, name: 'Sodium sulfite', cas: '7757-83-7', qty: 500, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 31, name: 'Hydroxylamine hydrochloride', cas: '5470-11-1', qty: 10, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 32, name: 'Ammonium chloride', cas: '12125-02-9', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 33, name: 'Sodium nitrite', cas: '7632-00-0', qty: 300, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Humid' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 34, name: 'Imidazole', cas: '288-32-4', qty: 100, unit: ChemicalUnit.GRAM, group: 'Heterocycles', note: 'Original observation: "À revoir"' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 35, name: 'Potassium hydroxide (caustic potash)', cas: '1310-58-3', qty: 10, unit: ChemicalUnit.GRAM, group: 'Bases' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 36, name: 'Lead acetate', cas: '301-04-2', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 37, name: 'Sodium perborate', cas: '7632-04-4', qty: 300, unit: ChemicalUnit.GRAM, group: 'Oxidizing agents' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 38, name: 'Copper(II) sulfate', cas: '7758-98-7', qty: 100, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Verify exact form' },
  { cabinet: 'CAB 1', level: '3', side: 'Left', pos: 39, name: 'Phenolphthalein indicator', cas: '77-09-8', qty: 400, unit: ChemicalUnit.GRAM, group: 'Indicators', note: '4 x 100 g (Four containers)' },

  // =========================================================================
  // CABINET 1 - HALLWAY (Salts Cabinet)
  // 4. Étage 04 : Left
  // =========================================================================
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 1, name: 'Sodium borate decahydrate (borax)', cas: '1303-96-4', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 2, name: 'Iron(III) chloride, anhydrous', cas: '7705-08-0', qty: 1500, unit: ChemicalUnit.GRAM, group: 'Salts', note: '800 g + 700 g; absorb moisture / oxidized' },
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 3, name: 'Paraformaldehyde', cas: '30525-89-4', qty: 1000, unit: ChemicalUnit.GRAM, group: 'Aldehydes' },
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 4, name: 'Potassium iodide', cas: '7681-11-0', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 5, name: 'Sodium mellitate?', cas: '—', qty: 250, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Original name: "Sodium mellu"; verify identity', needsId: true },
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 6, name: 'Sodium sulfite (Étage 04)', cas: '7757-83-7', qty: 500, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Separate record from Étage 03' },
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 7, name: 'Ammonium chloride (Étage 04)', cas: '12125-02-9', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Original code E046' },
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 8, name: 'Silica gel', cas: '112926-00-8', qty: 800, unit: ChemicalUnit.GRAM, group: 'Inorganics', note: '200 g + 600 g (Two quantities recorded)' },
  { cabinet: 'CAB 1', level: '4', side: 'Left', pos: 9, name: 'Lithium hydroxide monohydrate (LiOH·H2O)', cas: '1310-65-2', qty: 610, unit: ChemicalUnit.GRAM, group: 'Bases', note: '10 g + 600 g' },

  // =========================================================================
  // CABINET 1 - HALLWAY (Salts Cabinet)
  // 5. Étage 04 : Right
  // =========================================================================
  { cabinet: 'CAB 1', level: '4', side: 'Right', pos: 1, name: 'Unidentified chemical (+1 en bouteille)', cas: '—', qty: 1000, unit: ChemicalUnit.GRAM, group: 'Other', note: 'Identity missing', needsId: true },
  { cabinet: 'CAB 1', level: '4', side: 'Right', pos: 2, name: 'Magnesium hydrocarbonate x 2', cas: '39409-82-0', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Exact identity and quantity unclear' },
  { cabinet: 'CAB 1', level: '4', side: 'Right', pos: 3, name: 'Active vegetable charcoal', cas: '7440-44-0', qty: 400, unit: ChemicalUnit.GRAM, group: 'Inorganics', note: 'Original note: Nonidentifier' },
  { cabinet: 'CAB 1', level: '4', side: 'Right', pos: 4, name: 'Sodium hydride (NaH)', cas: '7646-69-7', qty: 100, unit: ChemicalUnit.GRAM, group: 'Reducing agents', note: 'Original entry: "Nach"; verify bottle label' },
  { cabinet: 'CAB 1', level: '4', side: 'Right', pos: 5, name: 'Zinc chloride (Étage 04)', cas: '7646-85-7', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '4', side: 'Right', pos: 6, name: 'Potassium thiocyanate', cas: '333-20-0', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts' },

  // =========================================================================
  // CABINET 1 - HALLWAY (Salts Cabinet)
  // 6. Étage 05 : Left
  // =========================================================================
  { cabinet: 'CAB 1', level: '5', side: 'Left', pos: 1, name: 'Copper(II) sulfate (Étage 05)', cas: '7758-98-7', qty: 100, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Exact form needs verification' },

  // =========================================================================
  // CABINET 1 - HALLWAY (Salts Cabinet)
  // 7. Étage 05 : Right
  // =========================================================================
  { cabinet: 'CAB 1', level: '5', side: 'Right', pos: 1, name: 'Zinc gluconate', cas: '4468-02-4', qty: 150, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 1', level: '5', side: 'Right', pos: 2, name: 'Magnesium hydrocarbonate x 2 (O5D)', cas: '39409-82-0', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Original code O5D' },
  { cabinet: 'CAB 1', level: '5', side: 'Right', pos: 3, name: 'Ammonium tetrafluoroborate', cas: '13826-83-0', qty: 100, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Quantity unclear; humid' },
  { cabinet: 'CAB 1', level: '5', side: 'Right', pos: 4, name: 'N-Bromosuccinimide (NBS)', cas: '128-08-5', qty: 10, unit: ChemicalUnit.GRAM, group: 'Halogenated compounds' },
  { cabinet: 'CAB 1', level: '5', side: 'Right', pos: 5, name: 'Barium nitrate', cas: '10022-31-8', qty: 85, unit: ChemicalUnit.GRAM, group: 'Oxidizing agents' },
  { cabinet: 'CAB 1', level: '5', side: 'Right', pos: 6, name: 'Lead tetraacetate', cas: '546-67-8', qty: 50, unit: ChemicalUnit.GRAM, group: 'Oxidizing agents', note: 'Quantity and CAS absent' },

  // =========================================================================
  // CABINET 3 - HALLWAY (Amines Cabinet)
  // 1. Étage 01: Amino acids, heterocycles and other reagents (Left side)
  // =========================================================================
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 1, name: 'Ethylenediaminetetraacetic acid (EDTA)', cas: '60-00-4', qty: 10, unit: ChemicalUnit.GRAM, group: 'Carboxylic acids', note: 'CAS needs verification' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 2, name: 'DL-Methionine', cas: '59-51-8', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 3, name: 'L-Glutamic acid', cas: '56-86-0', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'CAS needs verification (49450*)' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 4, name: 'DL-Alanine', cas: '302-72-7', qty: 50, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'CAS needs verification (05150*)' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 5, name: 'Imidazole', cas: '288-32-4', qty: 350, unit: ChemicalUnit.GRAM, group: 'Heterocycles', note: '100 g + 250 g (Two containers)' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 6, name: 'Sodium azide', cas: '26628-22-8', qty: 50, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Slightly humid' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 7, name: 'Malonamide (97%)', cas: '108-13-4', qty: 30, unit: ChemicalUnit.GRAM, group: 'Amides', note: 'Slightly humid' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 8, name: '1,2,4-Triazole', cas: '288-88-0', qty: 10, unit: ChemicalUnit.GRAM, group: 'Heterocycles' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 9, name: 'Pyridoxine hydrochloride (Vitamin B6)', cas: '58-56-0', qty: 20, unit: ChemicalUnit.GRAM, group: 'Heterocycles' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 10, name: 'Glycine methyl ester hydrochloride (99%)', cas: '5680-79-5', qty: 50, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Humid' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 11, name: '1,12-Diaminododecane', cas: '2783-17-7', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Humid' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 12, name: 'L-Valine', cas: '72-18-4', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Manufacturer: Fluka' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 13, name: '1,2-Diphenylhydrazine', cas: '122-66-7', qty: 160, unit: ChemicalUnit.GRAM, group: 'Amines', note: '80 g x 2 (Two containers; Aldrich Chemie)' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 14, name: 'N,O-Dimethylhydroxylamine hydrochloride (98%)', cas: '6638-79-5', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Aldrich; slightly humid' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 15, name: '3-Aminophenol', cas: '591-27-5', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 16, name: '1-Naphthylamine', cas: '134-32-7', qty: 100, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Fluka; humid' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 17, name: 'Tryptamine', cas: '61-54-1', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 18, name: 'L-Lysine monohydrochloride', cas: '657-27-2', qty: 5, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 19, name: 'Bis(2-chloroethyl)amine hydrochloride (98%)', cas: '821-48-7', qty: 20, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 20, name: '2,4-Dichloroaniline (99%)', cas: '554-00-7', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 21, name: 'p-Phenylenediamine (99%)', cas: '106-50-3', qty: 30, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 22, name: '1,9-Diaminononane', cas: '646-24-2', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '1', side: 'Left', pos: 23, name: 'Potassium cyanide', cas: '151-50-8', qty: 100, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Riedel-de Haën; slightly humid' },

  // =========================================================================
  // CABINET 3 - HALLWAY (Amines Cabinet)
  // 2. Étage 02 : Aromatic amines and related compounds (Left side)
  // =========================================================================
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 1, name: 'Aniline', cas: '62-53-3', qty: 100, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 2, name: '4-Chloroaniline', cas: '106-47-8', qty: 100, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Humid' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 3, name: '3-Chloroaniline', cas: '108-42-9', qty: 250, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 4, name: 'Methylamine solution', cas: '74-89-5', qty: 400, unit: ChemicalUnit.MILLILITER, group: 'Amines', note: 'Fluka' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 5, name: 'Hydrazine solution', cas: '302-01-2', qty: 100, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Concentration unspecified' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 6, name: '3,4-Dichloroaniline', cas: '95-76-1', qty: 100, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 7, name: 'Benzonitrile (98%)', cas: '100-47-0', qty: 450, unit: ChemicalUnit.MILLILITER, group: 'Aromatic compounds', note: 'Fluka' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 8, name: 'm-Phenylenediamine (99%)', cas: '108-45-2', qty: 200, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 9, name: 'N,N-Dibenzylethylenediamine (97%)', cas: '140-28-3', qty: 30, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 10, name: 'Cyclophosphamide monohydrate', cas: '6055-19-2', qty: 10, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Verify label and intended storage' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 11, name: 'Benzylamine', cas: '100-46-9', qty: 200, unit: ChemicalUnit.MILLILITER, group: 'Amines' },
  { cabinet: 'CAB 3', level: '2', side: 'Left', pos: 12, name: 'Hydroxylamine hydrochloride (Étage 02)', cas: '5470-11-1', qty: 100, unit: ChemicalUnit.GRAM, group: 'Amines' },

  // =========================================================================
  // CABINET 3 - HALLWAY (Amines Cabinet)
  // 3. Étage 03: Amines, bases and other organic reagents (Left side)
  // =========================================================================
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 1, name: '4-Fluoroaniline (99%)', cas: '371-40-4', qty: 400, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Aldrich' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 2, name: '1,2-Dimethylimidazole (98%)', cas: '1739-84-0', qty: 20, unit: ChemicalUnit.GRAM, group: 'Heterocycles' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 3, name: 'N-Ethyldiisopropylamine (DIPEA)', cas: '7087-68-5', qty: 250, unit: ChemicalUnit.MILLILITER, group: 'Amines', note: '200 mL + 50 mL (Fluka; two containers)' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 4, name: 'Pyridine', cas: '110-86-1', qty: 400, unit: ChemicalUnit.MILLILITER, group: 'Heterocycles' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 5, name: '4-Methylmorpholine (N-methylmorpholine)', cas: '109-02-4', qty: 250, unit: ChemicalUnit.MILLILITER, group: 'Amines' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 6, name: 'o-Toluidine', cas: '95-53-4', qty: 450, unit: ChemicalUnit.MILLILITER, group: 'Amines', note: 'Riedel-de Haën' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 7, name: 'Hexamethylenediamine (1,6-diaminohexane)', cas: '124-09-4', qty: 30, unit: ChemicalUnit.GRAM, group: 'Amines' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 8, name: 'Nitroethane (96%)', cas: '79-24-3', qty: 100, unit: ChemicalUnit.MILLILITER, group: 'Solvents', note: 'Quantity missing in PDF' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 9, name: 'L-Ephedrine hydrochloride', cas: '50-98-6', qty: 300, unit: ChemicalUnit.GRAM, group: 'Amines', note: '100 g x 3 (Three containers)' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 10, name: 'Malononitrile', cas: '109-77-3', qty: 50, unit: ChemicalUnit.GRAM, group: 'Other', note: 'CAS and quantity missing' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 11, name: 'Guanidine hydrochloride', cas: '50-01-1', qty: 200, unit: ChemicalUnit.GRAM, group: 'Bases' },
  { cabinet: 'CAB 3', level: '3', side: 'Left', pos: 12, name: '7-Chloro-4-nitrobenzofurazan (NBD chloride)', cas: '10199-89-0', qty: 2, unit: ChemicalUnit.GRAM, group: 'Heterocycles' },

  // =========================================================================
  // CABINET 4 - Inside Organic Chemistry Synthesis Lab Cabinet
  // Level 1: Unspecified shelf items (Left side)
  // =========================================================================
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 1, name: 'Magnesium sulfate, anhydrous', cas: '7487-88-9', qty: 1000, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 2, name: 'Aluminum oxide', cas: '1344-28-1', qty: 500, unit: ChemicalUnit.GRAM, group: 'Inorganics' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 3, name: 'Barium sulfate', cas: '7727-43-7', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 4, name: 'Ammonium acetate', cas: '631-61-8', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts', note: 'Humide (moist)' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 5, name: 'Potassium carbonate', cas: '584-08-7', qty: 250, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 6, name: '3-Nitroacetophenone', cas: '121-89-1', qty: 200, unit: ChemicalUnit.GRAM, group: 'Ketones' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 7, name: 'Triammonium phosphate', cas: '10361-65-6', qty: 400, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 8, name: 'Benzil', cas: '134-81-6', qty: 400, unit: ChemicalUnit.GRAM, group: 'Ketones', note: '200 g x 2 (Two containers)' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 9, name: 'Sodium carbonate (Synthesis Lab)', cas: '497-19-8', qty: 200, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 10, name: 'Molecular sieves 4A', cas: '70955-01-0', qty: 200, unit: ChemicalUnit.GRAM, group: 'Inorganics' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 11, name: 'Cyanoacetamide', cas: '107-91-5', qty: 200, unit: ChemicalUnit.GRAM, group: 'Amides' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 12, name: 'Potassium bicarbonate', cas: '298-14-6', qty: 250, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 13, name: 'Benzophenone (Synthesis Lab)', cas: '119-61-9', qty: 0, initQty: 200, unit: ChemicalUnit.GRAM, group: 'Ketones', note: 'Out of stock' },
  { cabinet: 'CAB 4', level: '1', side: 'Left', pos: 14, name: 'Ethyl acetoacetate', cas: '141-97-9', qty: 1200, unit: ChemicalUnit.MILLILITER, group: 'Esters', note: '1 L + 200 mL' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 1, name: 'Catechol', cas: '120-80-9', qty: 50, unit: ChemicalUnit.GRAM, group: 'Alcohols' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 2, name: 'Methyl acetoacetate', cas: '105-45-3', qty: 600, unit: ChemicalUnit.GRAM, group: 'Esters' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 3, name: 'Acetylacetone', cas: '123-54-6', qty: 600, unit: ChemicalUnit.MILLILITER, group: 'Ketones' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 4, name: 'Acetic acid', cas: '64-19-7', qty: 400, unit: ChemicalUnit.MILLILITER, group: 'Carboxylic acids' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 5, name: 'Benzaldehyde (Synthesis Lab)', cas: '100-52-7', qty: 100, unit: ChemicalUnit.MILLILITER, group: 'Aldehydes' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 6, name: 'Trichlorobenzaldehyde', cas: '104-88-1', qty: 200, unit: ChemicalUnit.GRAM, group: 'Aldehydes', note: 'Name/CAS mismatch; verify' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 7, name: '1,3-Diaminopropane', cas: '109-76-2', qty: 250, unit: ChemicalUnit.MILLILITER, group: 'Amines' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 8, name: 'sec-Butylamine', cas: '13952-84-6', qty: 250, unit: ChemicalUnit.MILLILITER, group: 'Amines' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 9, name: 'Dragendorff reagent', cas: '—', qty: 30, unit: ChemicalUnit.MILLILITER, group: 'Indicators' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 10, name: 'Vanillin', cas: '121-33-5', qty: 0, initQty: 100, unit: ChemicalUnit.GRAM, group: 'Aldehydes', note: 'Out of stock' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 11, name: 'Sodium hydride (Synthesis Lab)', cas: '7646-69-7', qty: 50, unit: ChemicalUnit.GRAM, group: 'Reducing agents' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 12, name: 'Dihydroxybenzaldehyde', cas: '95-05-2', qty: 50, unit: ChemicalUnit.GRAM, group: 'Aldehydes' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 13, name: '4-Fluorobenzaldehyde', cas: '459-57-4', qty: 10, unit: ChemicalUnit.GRAM, group: 'Aldehydes' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 14, name: 'Sodium pyruvate', cas: '113-24-6', qty: 10, unit: ChemicalUnit.GRAM, group: 'Salts' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 15, name: '2-Hydroxypropiophenone', cas: '610-99-1', qty: 10, unit: ChemicalUnit.GRAM, group: 'Ketones' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 16, name: 'Ethyl 2,3-dibromopropionate', cas: '3674-13-3', qty: 10, unit: ChemicalUnit.GRAM, group: 'Esters' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 17, name: 'Aniline (Synthesis Lab)', cas: '62-53-3', qty: 0, initQty: 250, unit: ChemicalUnit.GRAM, group: 'Amines', note: 'Out of stock' },
  { cabinet: 'CAB 4', level: '1', side: 'Right', pos: 18, name: 'Ethyl cyanoacetate', cas: '105-56-6', qty: 20, unit: ChemicalUnit.MILLILITER, group: 'Esters' },

  // =========================================================================
  // CABINET 4 - Inside Organic Chemistry Synthesis Lab Cabinet
  // Level 2: Étage 2
  // =========================================================================
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 1, name: 'Trimethyl orthoformate', cas: '149-73-5', qty: 500, unit: ChemicalUnit.GRAM, group: 'Esters', note: 'Étage 2' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 2, name: 'Salicylaldehyde (Étage 2)', cas: '90-02-8', qty: 50, unit: ChemicalUnit.GRAM, group: 'Aldehydes', note: 'Étage 2' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 3, name: '3-Chlorobenzaldehyde', cas: '587-04-2', qty: 50, unit: ChemicalUnit.GRAM, group: 'Aldehydes', note: 'Étage 2' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 4, name: '4-Methylacetophenone', cas: '122-00-9', qty: 500, unit: ChemicalUnit.GRAM, group: 'Ketones', note: 'Étage 2' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 5, name: 'Sulfur trioxide–pyridine complex', cas: '26412-87-3', qty: 50, unit: ChemicalUnit.GRAM, group: 'Sulfur compounds', note: 'Étage 2' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 6, name: 'Nicotinamide', cas: '98-92-0', qty: 0, initQty: 100, unit: ChemicalUnit.GRAM, group: 'Amides', note: 'Étage 2; out of stock' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 7, name: 'Resorcinol', cas: '108-46-3', qty: 0, initQty: 100, unit: ChemicalUnit.GRAM, group: 'Alcohols', note: 'Étage 2; out of stock' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 8, name: 'encatateaksod (Unidentified Étage 2)', cas: '—', qty: 200, unit: ChemicalUnit.GRAM, group: 'Other', note: 'Étage 2; name unclear', needsId: true },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 9, name: 'Potassium hydroxide (Étage 2)', cas: '1310-58-3', qty: 250, unit: ChemicalUnit.GRAM, group: 'Bases', note: 'Étage 2' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 10, name: 'Ethylene glycol (Étage 2)', cas: '107-21-1', qty: 400, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Étage 2' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 11, name: 'Malononitrile (Étage 2)', cas: '109-77-3', qty: 100, unit: ChemicalUnit.GRAM, group: 'Other', note: 'Étage 2; quantity unclear' },
  { cabinet: 'CAB 4', level: '2', side: 'Left', pos: 12, name: '3-Chlorobenzaldehyde (10 g, Étage 2)', cas: '587-04-2', qty: 10, unit: ChemicalUnit.GRAM, group: 'Aldehydes', note: 'Étage 2; separate entry' },

  // =========================================================================
  // CABINET 4 - Inside Organic Chemistry Synthesis Lab Cabinet
  // Level 3: Étage 3
  // =========================================================================
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 1, name: 'Petroleum ether', cas: '8032-32-4', qty: 2500, unit: ChemicalUnit.MILLILITER, group: 'Solvents', note: '500 mL + 1 L x 2 (Étage 3)' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 2, name: 'Toluene', cas: '108-88-3', qty: 1000, unit: ChemicalUnit.MILLILITER, group: 'Solvents', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 3, name: 'Ethylene glycol (2 L, Étage 3)', cas: '107-21-1', qty: 2000, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 4, name: 'Tetrahydrofuran (THF)', cas: '109-99-9', qty: 300, unit: ChemicalUnit.MILLILITER, group: 'Ethers', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 5, name: 'Diethyl ether', cas: '60-29-7', qty: 1000, unit: ChemicalUnit.MILLILITER, group: 'Ethers', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 6, name: 'Acetonitrile', cas: '75-05-8', qty: 1200, unit: ChemicalUnit.MILLILITER, group: 'Solvents', note: '1 L + 200 mL (Étage 3)' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 7, name: 'Methanol', cas: '67-56-1', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 8, name: '2-Butanone (MEK)', cas: '78-93-3', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Ketones', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 9, name: 'Benzene (Benzol)', cas: '71-43-2', qty: 700, unit: ChemicalUnit.MILLILITER, group: 'Aromatic compounds', note: 'Étage 3; original name: benzol' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 10, name: '1,4-Dioxane', cas: '123-91-1', qty: 700, unit: ChemicalUnit.MILLILITER, group: 'Ethers', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 11, name: 'tert-Butanol (Étage 3)', cas: '75-65-0', qty: 300, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 12, name: 'Sodium hydride (100 g, Étage 3)', cas: '7646-69-7', qty: 100, unit: ChemicalUnit.GRAM, group: 'Reducing agents', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 13, name: 'Hydrochloric acid', cas: '7647-01-0', qty: 1000, unit: ChemicalUnit.MILLILITER, group: 'Acids', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 14, name: 'Acetic acid (500 mL, Étage 3)', cas: '64-19-7', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Carboxylic acids', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 15, name: '2-Propanol (Isopropanol)', cas: '67-63-0', qty: 500, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: 'Étage 3' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 16, name: 'n-Hexane', cas: '110-54-3', qty: 4500, unit: ChemicalUnit.MILLILITER, group: 'Hydrocarbons', note: '4.5 L (Étage 3)' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 17, name: 'Sulfuric acid', cas: '7664-93-9', qty: 2000, unit: ChemicalUnit.MILLILITER, group: 'Acids', note: '2 L (Étage 3)' },
  { cabinet: 'CAB 4', level: '3', side: 'Left', pos: 18, name: 'Ethanol (2 L, Étage 3)', cas: '64-17-5', qty: 2000, unit: ChemicalUnit.MILLILITER, group: 'Alcohols', note: '2 L (Étage 3)' },
];

const CABINET_LABEL_MAP: Record<string, { label: string; room: string; storageClass: StorageClassification }> = {
  'CAB 1': {
    label: 'Cabinet 1 - Hallway (Salts Cabinet)',
    room: 'Hallway',
    storageClass: 'General storage',
  },
  'CAB 2': {
    label: 'Cabinet 2 - Hallway (Esters, Aldehydes, Ketones, Alcohols, Acids)',
    room: 'Hallway',
    storageClass: 'Flammable solvent',
  },
  'CAB 3': {
    label: 'Cabinet 3 - Hallway (Amines Cabinet)',
    room: 'Hallway',
    storageClass: 'Corrosive base',
  },
  'CAB 4': {
    label: 'Inside Organic Chemistry Synthesis Lab Cabinet',
    room: 'Synthesis Lab',
    storageClass: 'General synthesis cabinet',
  },
};

const BASE_DEMO_PRODUCTS: Product[] = PDF_INVENTORY_ROWS.map((row, index) => {
  const prodId = `PDF-PROD-${String(index + 1).padStart(3, '0')}`;
  const cabMeta = CABINET_LABEL_MAP[row.cabinet];
  const locCode = `${row.cabinet}- Level ${row.level}- ${row.side} side`;
  const effectiveInit = row.initQty || Math.max(row.qty, 100);

  return {
    productId: prodId,
    chemicalName: row.name,
    casNumber: row.cas,
    formula: '—',
    molecularWeight: 100,
    hazardClass: ['GHS07 Irritant'],
    storageRequirements: `${locCode} (${cabMeta.label})`,
    defaultUnit: row.unit,
    minimumStock: Math.round(effectiveInit * 0.2),
    reorderLevel: Math.round(effectiveInit * 0.4),
    sdsUrl:
      row.cas && row.cas !== '—'
        ? `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(row.cas)}`
        : `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(row.name)}`,
    createdAt: '2026-10-12T08:00:00Z',
    updatedAt: '2026-10-12T08:00:00Z',
    chemicalClassification: row.group,
    storageClassification: cabMeta.storageClass,
  };
});

const BASE_DEMO_CONTAINERS: ChemicalContainer[] = PDF_INVENTORY_ROWS.map((row, index) => {
  const prodId = `PDF-PROD-${String(index + 1).padStart(3, '0')}`;
  const contId = `REA-${String(index + 1).padStart(3, '0')}`;
  const cabMeta = CABINET_LABEL_MAP[row.cabinet];
  const posPadded = String(row.pos).padStart(2, '0');
  const locCode = `${row.cabinet}- Level ${row.level}- ${row.side} side`;
  const effectiveInit = row.initQty || Math.max(row.qty, 100);

  let status: ContainerStatus = ContainerStatus.NORMAL;
  if (row.needsId) {
    status = ContainerStatus.NEEDS_IDENTIFICATION;
  } else if (row.qty <= 0) {
    status = ContainerStatus.NEARLY_EMPTY;
  } else if (row.qty <= 10) {
    status = ContainerStatus.LOW_STOCK;
  }

  return {
    containerId: contId,
    productId: prodId,
    laboratoryId: 'LCSCO',
    initialQuantity: effectiveInit,
    currentQuantity: row.qty,
    unit: row.unit,
    location: {
      building: 'LCSCO',
      room: cabMeta.room,
      unit: row.cabinet,
      cabinetLabel: cabMeta.label,
      side: row.side,
      shelf: row.level,
      position: posPadded,
      code: locCode,
    },
    storageCondition: row.note ? `${locCode} — ${row.note}` : `${locCode} (${cabMeta.label})`,
    status,
    lotNumber: `PDF-${row.cabinet.replace(/\s+/g, '')}-L${row.level}-${posPadded}`,
    supplier: row.note && row.note.includes('Merck') ? 'Merck' : row.note && row.note.includes('Fluka') ? 'Fluka' : row.note && row.note.includes('Aldrich') ? 'Aldrich' : 'LCSCO Stock',
    expiryDate: '2028-12-31',
    createdAt: '2026-10-12T08:00:00Z',
    updatedAt: '2026-10-12T08:00:00Z',
    createdBy: 'temp-director',
    chemicalClassification: row.group,
    storageClassification: cabMeta.storageClass,
  };
});

export const INITIAL_PHYSICAL_LOCATIONS: PhysicalLocationConfig[] = [
  ...BASE_PHYSICAL_LOCATIONS,
  ...PDF21_PHYSICAL_LOCATIONS.filter(
    (loc) => !BASE_PHYSICAL_LOCATIONS.some((b) => b.id === loc.id || b.cabinet === loc.cabinet)
  ),
];

export const INITIAL_DEMO_PRODUCTS: Product[] = [
  ...BASE_DEMO_PRODUCTS,
  ...PDF21_PRODUCTS,
];

export const INITIAL_DEMO_CONTAINERS: ChemicalContainer[] = [
  ...BASE_DEMO_CONTAINERS,
  ...PDF21_CONTAINERS,
];

export const INITIAL_DEMO_TRANSACTIONS: InventoryTransaction[] = [];

export const INITIAL_DEMO_ADJUSTMENTS: StockAdjustmentRequest[] = [];

export const INITIAL_DEMO_DISPOSALS: DisposalWorkflowItem[] = [];

export const INITIAL_DEMO_PURCHASES: PurchaseWorkflowItem[] = [];

export const INITIAL_DEMO_RUPTURES: StockRuptureRequest[] = [];

export const INITIAL_DEMO_NOTIFICATIONS: AppNotification[] = [];
