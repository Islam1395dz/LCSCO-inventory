import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import {
  buildPersonalizedJarvisGreeting,
  executeConfirmedJarvisActionOnState,
  jarvisGetChemicalDetails,
  jarvisGetExpiringChemicals,
  jarvisGetInventoryStatistics,
  jarvisGetLowStockItems,
  jarvisGetStockLevel,
  jarvisGetStockMovementHistory,
  jarvisGetStorageLocation,
  jarvisGetUserPendingRequests,
  jarvisProposePurchaseRequest,
  jarvisProposeRecordConsumption,
  jarvisProposeRegisterContainer,
  jarvisProposeStockRuptureReport,
  jarvisSearchChemicals,
  JarvisChemicalCard,
  JarvisInventorySnapshot,
  JarvisToolExecutionOutput,
  JarvisUserContext,
  PendingJarvisAction,
} from './src/services/jarvisBackendTools';
import { UserRole } from './src/types/inventory';
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
} from './src/data/demoInventoryData';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const JARVIS_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'searchChemicals',
    description:
      'Search the laboratory chemical inventory by chemical name, synonym, molecular formula, CAS number, cabinet letter (A-J), or chemical classification (e.g., Aldehydes, Solvents, Organometallics, Bases, Acids, Oxidizers, Salts, Esters).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            'Free-text chemical name, synonym, formula, or keyword (e.g. "4-methoxyaniline", "ethanol", "palladium", "aldehyde", "NaBH4").',
        },
        classification: {
          type: Type.STRING,
          description:
            'Optional chemical family or class filter (e.g. "Aldehydes", "Organometallics", "Solvents", "Acids", "Bases").',
        },
        cabinet: {
          type: Type.STRING,
          description:
            'Optional storage cabinet code (CAB 1, CAB 2, CAB 3, or CAB 4).',
        },
        casNumber: {
          type: Type.STRING,
          description: 'Optional CAS registry number (e.g. "64-17-5", "16940-66-2").',
        },
      },
    },
  },
  {
    name: 'getChemicalDetails',
    description:
      'Retrieve full chemical and container details including formula, CAS number, supplier, lot number, expiration date, GHS hazards, storage requirements, and SDS reference.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        identifier: {
          type: Type.STRING,
          description: 'Chemical name, container ID (e.g. SOL-001), or CAS number.',
        },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'getStockLevel',
    description:
      'Check how much of a chemical reagent is currently available in the inventory and optionally verify whether there is enough stock for a planned experiment.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chemicalQuery: {
          type: Type.STRING,
          description: 'Chemical name, formula, CAS number, or container ID.',
        },
        requiredAmount: {
          type: Type.NUMBER,
          description:
            'Optional amount needed for a planned experiment to verify sufficiency.',
        },
        requiredUnit: {
          type: Type.STRING,
          description: 'Optional unit for requiredAmount (g, mg, kg, mL, L).',
        },
      },
      required: ['chemicalQuery'],
    },
  },
  {
    name: 'getStorageLocation',
    description:
      'Get the exact physical storage location (Room, Cabinet, Left/Right Side, Shelf, Position, and Location Code) for a chemical or container.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chemicalQuery: {
          type: Type.STRING,
          description: 'Chemical name, formula, CAS number, or container ID.',
        },
      },
      required: ['chemicalQuery'],
    },
  },
  {
    name: 'getLowStockItems',
    description:
      'List all chemicals and containers that are currently running low, nearly empty (<= 10%), or have active stock rupture alerts.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'getExpiringChemicals',
    description:
      'List all chemical containers that are expired or will expire soon within a given number of days.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        withinDays: {
          type: Type.NUMBER,
          description: 'Number of days ahead to check for expiration (default 180).',
        },
      },
    },
  },
  {
    name: 'getStockMovementHistory',
    description:
      'Query stock movement and consumption history: find who last used a chemical, how much of a chemical was consumed this month or recently, or inspect recent transactions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chemicalOrContainerQuery: {
          type: Type.STRING,
          description:
            'Optional chemical name, container ID, or CAS number to filter transactions.',
        },
        daysBack: {
          type: Type.NUMBER,
          description:
            'Optional time window in days (e.g. 30 for "this month", 7 for "this week").',
        },
        limit: {
          type: Type.NUMBER,
          description: 'Maximum number of recent transactions to return (default 10).',
        },
      },
    },
  },
  {
    name: 'getUserPendingRequests',
    description:
      'Retrieve pending purchase requests, disposal requests, stock adjustment requests, or stock ruptures authorized for the current user role.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'getInventoryStatistics',
    description:
      'Get overall LCSCO laboratory inventory statistics, total containers, catalog size, low stock counts, and breakdown by storage cabinet.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'proposeRecordConsumption',
    description:
      'Stage a voice-controlled stock consumption/withdrawal operation (e.g. "I used 2 grams of potassium carbonate"). This validates permissions and stages a confirmation prompt without mutating the database until the user confirms.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chemicalOrContainerQuery: {
          type: Type.STRING,
          description: 'Chemical name or container ID being consumed.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Numeric quantity consumed (e.g. 2, 50, 100).',
        },
        unit: {
          type: Type.STRING,
          description: 'Unit of measurement (g, mg, kg, mL, L).',
        },
        reason: {
          type: Type.STRING,
          description: 'Optional experiment or usage note.',
        },
      },
      required: ['chemicalOrContainerQuery', 'amount', 'unit'],
    },
  },
  {
    name: 'proposePurchaseRequest',
    description:
      'Stage a purchase request for a chemical reagent (e.g. "Request 500 grams of sodium hydroxide"). Stages a confirmation prompt before submitting.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chemicalName: {
          type: Type.STRING,
          description: 'Name of the chemical to order.',
        },
        requestedQuantity: {
          type: Type.NUMBER,
          description: 'Quantity to request (e.g. 500).',
        },
        unit: {
          type: Type.STRING,
          description: 'Unit (g, mg, kg, mL, L).',
        },
        reason: {
          type: Type.STRING,
          description: 'Optional justification for the purchase request.',
        },
        supplier: {
          type: Type.STRING,
          description: 'Optional preferred supplier (e.g. Sigma-Aldrich, Alfa Aesar).',
        },
      },
      required: ['chemicalName', 'requestedQuantity', 'unit'],
    },
  },
  {
    name: 'proposeStockRuptureReport',
    description:
      'Stage a stock rupture or empty bottle report (e.g. "Report that the ethanol bottle is empty"). Stages a confirmation prompt before recording.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chemicalOrContainerQuery: {
          type: Type.STRING,
          description: 'Chemical name or container ID that is empty or nearly empty.',
        },
        comment: {
          type: Type.STRING,
          description: 'Optional observation or note.',
        },
      },
      required: ['chemicalOrContainerQuery'],
    },
  },
  {
    name: 'proposeRegisterContainer',
    description:
      'Stage registration of a new chemical container into the inventory (Director, Professor, or Lab Engineer only). Requires explicit user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        chemicalName: {
          type: Type.STRING,
          description: 'Name of the chemical reagent.',
        },
        quantity: {
          type: Type.NUMBER,
          description: 'Initial container quantity.',
        },
        unit: {
          type: Type.STRING,
          description: 'Unit (mL, L, g, kg, mg).',
        },
        cabinet: {
          type: Type.STRING,
          description: 'Target storage cabinet letter (A-J).',
        },
        side: {
          type: Type.STRING,
          description: 'Cabinet side: Left or Right.',
        },
        shelf: {
          type: Type.STRING,
          description: 'Shelf number (1-4).',
        },
        position: {
          type: Type.STRING,
          description: 'Position number on the shelf (01-12).',
        },
      },
      required: ['chemicalName', 'quantity', 'unit'],
    },
  },
];

function detectLanguageFromText(
  text: string,
  fallback: 'en' | 'fr' | 'ar' = 'en'
): 'en' | 'fr' | 'ar' {
  const sample = (text || '').trim();
  if (!sample) return fallback;
  if (/[\u0600-\u06FF]/.test(sample)) {
    return 'ar';
  }
  const lower = sample.toLowerCase();
  const frenchMarkers = [
    'bonjour',
    'bonsoir',
    'combien',
    'où est',
    'ou est',
    'avons-nous',
    'est-ce que',
    'réactif',
    'reactif',
    'armoire',
    'stock',
    'utilisé',
    'utilise',
    'grammes',
    'bouteille',
    'demande',
    'chercher',
    'trouver',
    'merci',
    'oui',
    'non',
    'éthanol',
    'acétone',
  ];
  const englishMarkers = [
    'do we have',
    'how much',
    'where is',
    'show me',
    'find',
    'which',
    'who last',
    'i used',
    'request',
    'report',
    'register',
    'cabinet',
    'grams',
    'bottle',
    'yes',
    'confirm',
  ];

  let frScore = 0;
  let enScore = 0;
  frenchMarkers.forEach((m) => {
    if (lower.includes(m)) frScore += 1;
  });
  englishMarkers.forEach((m) => {
    if (lower.includes(m)) enScore += 1;
  });

  if (frScore > enScore) return 'fr';
  if (enScore > frScore) return 'en';
  return fallback;
}

function executeJarvisToolCall(
  name: string,
  args: Record<string, any>,
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext
): JarvisToolExecutionOutput {
  switch (name) {
    case 'searchChemicals':
      return jarvisSearchChemicals(snapshot, user, args);
    case 'getChemicalDetails':
      return jarvisGetChemicalDetails(snapshot, user, {
        identifier: String(args.identifier || ''),
      });
    case 'getStockLevel':
      return jarvisGetStockLevel(snapshot, user, {
        chemicalQuery: String(args.chemicalQuery || ''),
        requiredAmount:
          args.requiredAmount !== undefined ? Number(args.requiredAmount) : undefined,
        requiredUnit: args.requiredUnit ? String(args.requiredUnit) : undefined,
      });
    case 'getStorageLocation':
      return jarvisGetStorageLocation(snapshot, user, {
        chemicalQuery: String(args.chemicalQuery || ''),
      });
    case 'getLowStockItems':
      return jarvisGetLowStockItems(snapshot, user);
    case 'getExpiringChemicals':
      return jarvisGetExpiringChemicals(snapshot, user, {
        withinDays: args.withinDays ? Number(args.withinDays) : 180,
      });
    case 'getStockMovementHistory':
      return jarvisGetStockMovementHistory(snapshot, user, {
        chemicalOrContainerQuery: args.chemicalOrContainerQuery
          ? String(args.chemicalOrContainerQuery)
          : undefined,
        daysBack: args.daysBack ? Number(args.daysBack) : undefined,
        limit: args.limit ? Number(args.limit) : 10,
      });
    case 'getUserPendingRequests':
      return jarvisGetUserPendingRequests(snapshot, user);
    case 'getInventoryStatistics':
      return jarvisGetInventoryStatistics(snapshot, user);
    case 'proposeRecordConsumption':
      return jarvisProposeRecordConsumption(snapshot, user, {
        chemicalOrContainerQuery: String(args.chemicalOrContainerQuery || ''),
        amount: Number(args.amount || 0),
        unit: String(args.unit || 'g'),
        reason: args.reason ? String(args.reason) : undefined,
      });
    case 'proposePurchaseRequest':
      return jarvisProposePurchaseRequest(snapshot, user, {
        chemicalName: String(args.chemicalName || ''),
        requestedQuantity: Number(args.requestedQuantity || 0),
        unit: String(args.unit || 'g'),
        reason: args.reason ? String(args.reason) : undefined,
        supplier: args.supplier ? String(args.supplier) : undefined,
      });
    case 'proposeStockRuptureReport':
      return jarvisProposeStockRuptureReport(snapshot, user, {
        chemicalOrContainerQuery: String(args.chemicalOrContainerQuery || ''),
        comment: args.comment ? String(args.comment) : undefined,
      });
    case 'proposeRegisterContainer':
      return jarvisProposeRegisterContainer(snapshot, user, {
        chemicalName: String(args.chemicalName || ''),
        quantity: Number(args.quantity || 0),
        unit: String(args.unit || 'mL'),
        cabinet: args.cabinet ? String(args.cabinet) : undefined,
        side: args.side === 'Right' ? 'Right' : 'Left',
        shelf: args.shelf ? String(args.shelf) : undefined,
        position: args.position ? String(args.position) : undefined,
      });
    default:
      return {
        toolResult: { error: `Unknown tool: ${name}` },
        cards: [],
      };
  }
}

/**
 * Deterministic fallback interpreter in case Gemini API is temporarily unavailable
 */
function runDeterministicJarvisFallback(
  message: string,
  snapshot: JarvisInventorySnapshot,
  user: JarvisUserContext,
  lang: 'en' | 'fr' | 'ar'
): {
  reply: string;
  cards: JarvisChemicalCard[];
  pendingAction: PendingJarvisAction | null;
  executedTools: string[];
} {
  const lower = message.toLowerCase().trim();

  // Check consumption pattern: "I used 2 grams of potassium carbonate"
  const consumeMatch =
    lower.match(
      /(?:i used|j'ai utilisé|j ai utilise|consume|withdraw)\s+(\d+(?:\.\d+)?)\s*(g|grams?|grammes?|mg|kg|ml|milliliters?|l|liters?)\s+(?:of|de|d')\s+(.+)/i
    ) ||
    lower.match(
      /(\d+(?:\.\d+)?)\s*(g|grams?|grammes?|mg|kg|ml|l)\s+(?:of|de)\s+([a-z0-9\-\s]+)\s+(?:used|consumed)/i
    );
  if (consumeMatch) {
    const amount = parseFloat(consumeMatch[1]);
    const unit = consumeMatch[2];
    const chem = consumeMatch[3].replace(/[.?]/g, '').trim();
    const out = jarvisProposeRecordConsumption(snapshot, user, {
      chemicalOrContainerQuery: chem,
      amount,
      unit,
    });
    return {
      reply:
        out.pendingAction?.readBackPrompt ||
        out.toolResult.message ||
        'Please confirm your stock consumption details.',
      cards: out.cards,
      pendingAction: out.pendingAction || null,
      executedTools: ['proposeRecordConsumption'],
    };
  }

  // Check purchase request pattern: "Request 500 grams of sodium hydroxide"
  const reqMatch = lower.match(
    /(?:request|order|commander|demander)\s+(\d+(?:\.\d+)?)\s*(g|grams?|grammes?|mg|kg|ml|l)\s+(?:of|de|d')\s+(.+)/i
  );
  if (reqMatch) {
    const qty = parseFloat(reqMatch[1]);
    const unit = reqMatch[2];
    const chem = reqMatch[3].replace(/[.?]/g, '').trim();
    const out = jarvisProposePurchaseRequest(snapshot, user, {
      chemicalName: chem,
      requestedQuantity: qty,
      unit,
    });
    return {
      reply:
        out.pendingAction?.readBackPrompt ||
        out.toolResult.message ||
        'Please confirm your purchase request.',
      cards: out.cards,
      pendingAction: out.pendingAction || null,
      executedTools: ['proposePurchaseRequest'],
    };
  }

  // Low stock
  if (
    lower.includes('running low') ||
    lower.includes('low stock') ||
    lower.includes('stock faible') ||
    lower.includes('rupture')
  ) {
    const out = jarvisGetLowStockItems(snapshot, user);
    const items = out.toolResult.lowStockItems || [];
    if (items.length === 0) {
      return {
        reply:
          lang === 'fr'
            ? "Aucun réactif n'est actuellement en stock faible dans l'inventaire LCSCO."
            : 'No chemicals are currently running low in the LCSCO inventory.',
        cards: [],
        pendingAction: null,
        executedTools: ['getLowStockItems'],
      };
    }
    const summaryList = items
      .slice(0, 4)
      .map((i: any) => `${i.chemicalName} (${i.currentQuantity} ${i.unit}, ${i.location})`)
      .join('; ');
    return {
      reply:
        lang === 'fr'
          ? `J'ai identifié ${items.length} réactif(s) en stock faible ou critique : ${summaryList}.`
          : `I found ${items.length} chemical(s) running low: ${summaryList}.`,
      cards: out.cards,
      pendingAction: null,
      executedTools: ['getLowStockItems'],
    };
  }

  // Expiring soon
  if (
    lower.includes('expir') ||
    lower.includes('périm') ||
    lower.includes('perim')
  ) {
    const out = jarvisGetExpiringChemicals(snapshot, user, { withinDays: 365 });
    const items = out.toolResult.items || [];
    if (items.length === 0) {
      return {
        reply:
          lang === 'fr'
            ? "Aucun réactif n'arrive à expiration prochainement."
            : 'No reagents are expiring within the upcoming window.',
        cards: [],
        pendingAction: null,
        executedTools: ['getExpiringChemicals'],
      };
    }
    const summary = items
      .slice(0, 4)
      .map((i: any) => `${i.chemicalName} (Exp: ${i.expiryDate})`)
      .join(', ');
    return {
      reply:
        lang === 'fr'
          ? `Voici les réactifs proches de leur date d'expiration : ${summary}.`
          : `Here are the reagents approaching expiration: ${summary}.`,
      cards: out.cards,
      pendingAction: null,
      executedTools: ['getExpiringChemicals'],
    };
  }

  // Cabinet query: "cabinet B" or "armoire B"
  const cabMatch = lower.match(/(?:cabinet|armoire)\s+([a-j])\b/i);
  if (cabMatch) {
    const cab = cabMatch[1].toUpperCase();
    const out = jarvisSearchChemicals(snapshot, user, { cabinet: cab });
    const items = out.toolResult.items || [];
    if (items.length === 0) {
      return {
        reply:
          lang === 'fr'
            ? `Aucun contenant n'est actuellement enregistré dans l'Armoire ${cab}.`
            : `No containers are currently registered in Cabinet ${cab}.`,
        cards: [],
        pendingAction: null,
        executedTools: ['searchChemicals'],
      };
    }
    const names = items.map((i: any) => `${i.chemicalName} (${i.currentQuantity} ${i.unit})`).join(', ');
    return {
      reply:
        lang === 'fr'
          ? `L'Armoire ${cab} contient ${items.length} flacon(s) : ${names}.`
          : `Cabinet ${cab} holds ${items.length} container(s): ${names}.`,
      cards: out.cards,
      pendingAction: null,
      executedTools: ['searchChemicals'],
    };
  }

  // Default search query extraction
  const cleanedQuery = lower
    .replace(
      /^(do we have|how much|where is|find all|find|show me|search for|is there any|avons-nous|combien de|où est|ou est|trouver|chercher)\s+/i,
      ''
    )
    .replace(/\s+(is available|in the inventory|stored|do we have|disponible|en stock)\??$/i, '')
    .replace(/[?.,!]/g, '')
    .trim();

  const out = jarvisSearchChemicals(snapshot, user, { query: cleanedQuery });
  const items = out.toolResult.items || [];
  if (items.length === 0) {
    return {
      reply:
        lang === 'fr'
          ? `Je ai vérifié la base de données LCSCO : aucun réactif correspondant à "${cleanedQuery}" n'a été trouvé en stock.`
          : `I checked the LCSCO inventory database: we do not currently have "${cleanedQuery}" in stock.`,
      cards: [],
      pendingAction: null,
      executedTools: ['searchChemicals'],
    };
  }

  const first = items[0];
  return {
    reply:
      lang === 'fr'
        ? `Nous avons ${items.length} contenant(s) correspondant(s). Par exemple : ${first.chemicalName} (${first.currentQuantity} ${first.unit}) stocké dans ${first.location}.`
        : `We have ${items.length} matching container(s) in stock. Specifically, ${first.chemicalName} has ${first.currentQuantity} ${first.unit} available, stored at ${first.location}.`,
    cards: out.cards,
    pendingAction: null,
    executedTools: ['searchChemicals'],
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  const PORT = Number(process.env.PORT) || 3000;

  // Track executed JARVIS action IDs for idempotency
  const executedJarvisActionIds = new Set<string>();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'LCSCO Inventory' });
  });

  // Shared server-side state store so all 4 profiles synchronize across tabs, browsers, and devices
  let sharedInventoryState: {
    version: number;
    updatedAt: string;
    containers?: any[];
    transactions?: any[];
    products?: any[];
    laboratories?: any[];
    users?: any[];
    adjustmentRequests?: any[];
    disposalRequests?: any[];
    purchaseRequests?: any[];
    stockRuptureRequests?: any[];
    notifications?: any[];
    physicalLocations?: any[];
    labFloorPlanConfig?: any;
  } = {
    version: 1,
    updatedAt: new Date().toISOString(),
    containers: INITIAL_DEMO_CONTAINERS,
    transactions: INITIAL_DEMO_TRANSACTIONS,
    products: INITIAL_DEMO_PRODUCTS,
    adjustmentRequests: INITIAL_DEMO_ADJUSTMENTS,
    disposalRequests: INITIAL_DEMO_DISPOSALS,
    purchaseRequests: INITIAL_DEMO_PURCHASES,
    stockRuptureRequests: INITIAL_DEMO_RUPTURES,
    notifications: INITIAL_DEMO_NOTIFICATIONS,
    physicalLocations: INITIAL_PHYSICAL_LOCATIONS,
  };

  app.get('/api/shared-state', (_req, res) => {
    res.json(sharedInventoryState);
  });

  app.post('/api/shared-state/clear-all', (_req, res) => {
    sharedInventoryState = {
      ...sharedInventoryState,
      version: sharedInventoryState.version + 1,
      updatedAt: new Date().toISOString(),
      containers: [],
      products: [],
      transactions: [],
      adjustmentRequests: [],
      disposalRequests: [],
      purchaseRequests: [],
      stockRuptureRequests: [],
      notifications: [],
      physicalLocations: [],
    };
    res.json({ success: true, state: sharedInventoryState });
  });

  /**
   * AI Real Inventory Document Importer (PDF, Image, CSV, or Text)
   * Parses an attached laboratory inventory file, creates the corresponding cabinets,
   * and attaches each reagent with its cabinet, level, and side using the exact code format:
   *   "CAB 1- Level 1- Right side"
   */
  app.post('/api/inventory/import-document', async (req, res) => {
    try {
      const { fileBase64, mimeType, rawText, replaceExisting = true } = req.body || {};
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'Gemini API is not configured on the server.',
        });
        return;
      }

      const extractionPrompt = `You are a laboratory chemical inventory data engineer for LCSCO.
Analyze the attached laboratory inventory document/data and extract every chemical reagent/solvent/salt and its physical storage cabinet, level (shelf), and side (Left or Right).

CRITICAL FORMATTING RULES:
1. Cabinet naming: Normalize cabinet codes to "CAB 1", "CAB 2", "CAB 3", etc.
2. Level (shelf): Normalize shelf/level to a number string such as "1", "2", "3", "4".
3. Side: Must be either "Right" or "Left" (default to "Right" or "Left" based on the document; if unspecified, distribute logically between "Left" and "Right").
4. Location code MUST strictly follow this exact format:
   "CAB 1- Level 1- Right side" or "CAB 1- Level 2- Left side"
5. Create the appropriate cabinets list summarizing all cabinets discovered in the inventory and their reagent classes/labels.
6. For each reagent, provide chemicalName, formula (infer standard chemical formula if not explicitly written), casNumber (infer standard CAS if known, else "N/A"), quantity (numeric, default 500 or 1000 if unspecified), unit ("g", "mg", "kg", "mL", or "L"), cabinetCode (e.g. "CAB 1"), level (e.g. "1"), side ("Left" or "Right"), chemicalClassification, supplier, and lotNumber.`;

      const parts: any[] = [];
      if (fileBase64 && mimeType) {
        parts.push({
          inlineData: {
            data: String(fileBase64).replace(/^data:[^;]+;base64,/, ''),
            mimeType: String(mimeType),
          },
        });
      }
      if (rawText && String(rawText).trim()) {
        parts.push({
          text: `INVENTORY DATA:\n${String(rawText).trim()}`,
        });
      }
      parts.push({ text: extractionPrompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cabinets: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    cabinetCode: {
                      type: Type.STRING,
                      description: 'Normalized cabinet code, e.g. "CAB 1", "CAB 2"',
                    },
                    cabinetLabel: {
                      type: Type.STRING,
                      description: 'Descriptive name for this cabinet based on its reagents, e.g. "CAB 1 — Organic Solvents & Reagents"',
                    },
                    storageClassification: {
                      type: Type.STRING,
                      description: 'Storage classification, e.g. "Flammable solvent", "General storage"',
                    },
                    levels: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Levels/shelves in this cabinet, e.g. ["1", "2", "3", "4"]',
                    },
                  },
                  required: ['cabinetCode', 'cabinetLabel', 'levels'],
                },
              },
              reagents: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    chemicalName: { type: Type.STRING },
                    casNumber: { type: Type.STRING },
                    formula: { type: Type.STRING },
                    molecularWeight: { type: Type.NUMBER },
                    quantity: { type: Type.NUMBER },
                    unit: {
                      type: Type.STRING,
                      description: 'Must be one of: g, kg, mg, mL, L',
                    },
                    cabinetCode: {
                      type: Type.STRING,
                      description: 'e.g. "CAB 1"',
                    },
                    level: {
                      type: Type.STRING,
                      description: 'Level number, e.g. "1", "2", "3"',
                    },
                    side: {
                      type: Type.STRING,
                      description: 'Must be "Left" or "Right"',
                    },
                    position: {
                      type: Type.STRING,
                      description: 'Position number on the level, e.g. "01", "02"',
                    },
                    chemicalClassification: { type: Type.STRING },
                    supplier: { type: Type.STRING },
                    lotNumber: { type: Type.STRING },
                  },
                  required: [
                    'chemicalName',
                    'quantity',
                    'unit',
                    'cabinetCode',
                    'level',
                    'side',
                  ],
                },
              },
            },
            required: ['cabinets', 'reagents'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"cabinets":[],"reagents":[]}');
      res.json({
        success: true,
        replaceExisting,
        cabinets: parsed.cabinets || [],
        reagents: parsed.reagents || [],
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to parse inventory document.',
      });
    }
  });

  app.post('/api/shared-state', (req, res) => {
    const body = req.body || {};
    sharedInventoryState = {
      version: sharedInventoryState.version + 1,
      updatedAt: new Date().toISOString(),
      containers: body.containers ?? sharedInventoryState.containers,
      transactions: body.transactions ?? sharedInventoryState.transactions,
      products: body.products ?? sharedInventoryState.products,
      laboratories: body.laboratories ?? sharedInventoryState.laboratories,
      users: body.users ?? sharedInventoryState.users,
      adjustmentRequests: body.adjustmentRequests ?? sharedInventoryState.adjustmentRequests,
      disposalRequests: body.disposalRequests ?? sharedInventoryState.disposalRequests,
      purchaseRequests: body.purchaseRequests ?? sharedInventoryState.purchaseRequests,
      stockRuptureRequests: body.stockRuptureRequests ?? sharedInventoryState.stockRuptureRequests,
      notifications: body.notifications ?? sharedInventoryState.notifications,
      physicalLocations: body.physicalLocations ?? sharedInventoryState.physicalLocations,
      labFloorPlanConfig: body.labFloorPlanConfig ?? sharedInventoryState.labFloorPlanConfig,
    };
    res.json(sharedInventoryState);
  });

  /**
   * JARVIS Personalized Session Greeting Endpoint
   */
  app.post('/api/jarvis/greeting', (req, res) => {
    try {
      const { userContext, inventorySnapshot, localHour, language } = req.body || {};
      const user: JarvisUserContext = {
        uid: userContext?.uid || 'anon',
        fullName: userContext?.fullName || '',
        email: userContext?.email || '',
        role: (userContext?.role as UserRole) || UserRole.PHD_STUDENT,
        laboratoryIds: userContext?.laboratoryIds || ['LCSCO'],
      };

      const snapshot: JarvisInventorySnapshot = {
        containers: inventorySnapshot?.containers || sharedInventoryState.containers || [],
        products: inventorySnapshot?.products || sharedInventoryState.products || [],
        transactions: inventorySnapshot?.transactions || sharedInventoryState.transactions || [],
        purchaseRequests:
          inventorySnapshot?.purchaseRequests || sharedInventoryState.purchaseRequests || [],
        disposalRequests:
          inventorySnapshot?.disposalRequests || sharedInventoryState.disposalRequests || [],
        adjustmentRequests:
          inventorySnapshot?.adjustmentRequests || sharedInventoryState.adjustmentRequests || [],
        stockRuptureRequests:
          inventorySnapshot?.stockRuptureRequests ||
          sharedInventoryState.stockRuptureRequests ||
          [],
        physicalLocations:
          inventorySnapshot?.physicalLocations || sharedInventoryState.physicalLocations || [],
      };

      const greeting = buildPersonalizedJarvisGreeting({
        user,
        snapshot,
        localHour: typeof localHour === 'number' ? localHour : new Date().getHours(),
        language: language === 'fr' || language === 'ar' ? language : 'en',
      });

      res.json({ greeting });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to build personalized JARVIS greeting.',
      });
    }
  });

  /**
   * JARVIS Conversational & Voice Inventory Endpoint (Gemini 3.8 Flash Function Calling)
   */
  app.post('/api/jarvis/chat', async (req, res) => {
    try {
      const {
        message,
        conversationHistory = [],
        userContext,
        inventorySnapshot,
        localHour,
        preferredLanguage = 'en',
        pendingAction = null,
      } = req.body || {};

      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const user: JarvisUserContext = {
        uid: userContext?.uid || 'anon',
        fullName: userContext?.fullName || 'Researcher',
        email: userContext?.email || '',
        role: (userContext?.role as UserRole) || UserRole.PHD_STUDENT,
        laboratoryIds: userContext?.laboratoryIds || ['LCSCO'],
      };

      const snapshot: JarvisInventorySnapshot = {
        containers: inventorySnapshot?.containers || sharedInventoryState.containers || [],
        products: inventorySnapshot?.products || sharedInventoryState.products || [],
        transactions: inventorySnapshot?.transactions || sharedInventoryState.transactions || [],
        purchaseRequests:
          inventorySnapshot?.purchaseRequests || sharedInventoryState.purchaseRequests || [],
        disposalRequests:
          inventorySnapshot?.disposalRequests || sharedInventoryState.disposalRequests || [],
        adjustmentRequests:
          inventorySnapshot?.adjustmentRequests || sharedInventoryState.adjustmentRequests || [],
        stockRuptureRequests:
          inventorySnapshot?.stockRuptureRequests ||
          sharedInventoryState.stockRuptureRequests ||
          [],
        physicalLocations:
          inventorySnapshot?.physicalLocations || sharedInventoryState.physicalLocations || [],
      };

      // Sync latest snapshot into sharedInventoryState if needed
      if (snapshot.containers.length > 0 && !sharedInventoryState.containers) {
        sharedInventoryState = {
          ...sharedInventoryState,
          ...snapshot,
          version: sharedInventoryState.version + 1,
          updatedAt: new Date().toISOString(),
        };
      }

      const detectedLang = detectLanguageFromText(
        message,
        preferredLanguage === 'fr' || preferredLanguage === 'ar' ? preferredLanguage : 'en'
      );

      // Check if user is directly confirming or cancelling a staged PendingJarvisAction via voice/text
      if (pendingAction && pendingAction.actionId) {
        const cleanMsg = message.trim().toLowerCase();
        const isAffirmative =
          /^(yes|yep|yeah|confirm|confirmed|correct|do it|proceed|go ahead|affirmative|oui|tout à fait|confirmer|je confirme|d'accord|vas-y|نعم|تأكيد|موافق|صحيح)\b/i.test(
            cleanMsg
          );
        const isNegative =
          /^(no|nope|cancel|abort|stop|nevermind|non|annuler|arrêter|لا|إلغاء)\b/i.test(
            cleanMsg
          );

        if (isAffirmative) {
          const execResult = executeConfirmedJarvisActionOnState(
            snapshot,
            user,
            pendingAction,
            executedJarvisActionIds
          );
          sharedInventoryState = {
            ...sharedInventoryState,
            ...execResult.updatedSnapshot,
            version: sharedInventoryState.version + 1,
            updatedAt: new Date().toISOString(),
          };
          res.json({
            reply: execResult.confirmationMessage,
            detectedLanguage: detectedLang,
            cards: execResult.updatedCard ? [execResult.updatedCard] : [],
            pendingAction: null,
            actionExecuted: true,
            updatedSnapshot: execResult.updatedSnapshot,
            executedTools: ['executeConfirmedJarvisActionOnState'],
          });
          return;
        }

        if (isNegative) {
          const cancelReply =
            detectedLang === 'fr'
              ? `Entendu, ${user.fullName}. L'opération en attente a été annulée et aucune modification n'a été apportée au stock.`
              : detectedLang === 'ar'
              ? `مفهوم يا ${user.fullName}. تم إلغاء العملية ولم يتم تعديل سجل المخزون.`
              : `Understood, ${user.fullName}. The pending stock operation has been cancelled and no changes were made.`;
          res.json({
            reply: cancelReply,
            detectedLanguage: detectedLang,
            cards: [],
            pendingAction: null,
            actionCancelled: true,
            executedTools: [],
          });
          return;
        }
      }

      const ai = getGeminiClient();
      if (!ai) {
        const fallback = runDeterministicJarvisFallback(
          message,
          snapshot,
          user,
          detectedLang
        );
        res.json({
          reply: fallback.reply,
          detectedLanguage: detectedLang,
          cards: fallback.cards,
          pendingAction: fallback.pendingAction,
          executedTools: fallback.executedTools,
        });
        return;
      }

      const systemInstruction = `You are JARVIS, the intelligent voice-controlled AI Laboratory Assistant for LCSCO (Laboratoire de Catalyse et Synthèse en Chimie Organique).
You assist laboratory directors, professors, laboratory engineers, and PhD students with real-time chemical inventory queries and safe voice-controlled stock operations.

CURRENT AUTHENTICATED USER PROFILE:
- Full Name: "${user.fullName}"
- Role: "${user.role}" (Note: ADMIN = Director, PROFESSOR = Professor/Supervisor, TECHNICIAN = Laboratory Engineer, PHD_STUDENT = PhD Student/Researcher)
- Local Hour: ${typeof localHour === 'number' ? localHour : 12}:00

STRICT OPERATING RULES:
1. NEVER invent, guess, or hallucinate chemical inventory data, quantities, CAS numbers, or storage locations. ALWAYS call the provided inventory tools first to inspect the actual LCSCO database.
2. Do NOT repeat the initial welcome greeting on every message. Address the user naturally and occasionally by their name ("${user.fullName}"), keeping answers concise, crisp, and spoken-friendly (1 to 3 sentences, suitable for voice synthesis).
3. Respond in the SAME language the user is speaking (English, French, or Arabic). Detected language for this turn: "${detectedLang}".
4. When answering stock or location questions, always state the exact quantity, unit, container ID, and physical storage location (Room → Cabinet → Left/Right Side → Shelf → Position).
5. If multiple distinct chemicals match a query (` + '`ambiguousMultipleChemicals: true` or `needsClarification: true`' + `), politely list the matching chemical names and ask the user which one they mean.
6. VOICE-CONTROLLED STOCK MUTATIONS (CRITICAL SAFETY RULE):
   - When the user says they consumed/used a reagent, wants to request a purchase, report an empty bottle, or register a container, call the corresponding ` + '`propose...`' + ` tool.
   - NEVER claim that the stock has already been updated when a tool returns ` + '`status: "CONFIRMATION_REQUIRED"`' + `.
   - Instead, read back the exact chemical name, container ID, quantity, unit, and resulting stock level, and explicitly ask the user to confirm (e.g., "You want to record the consumption of 2 g of Potassium carbonate from container BASE-002. Is that correct?").
7. Enforce strict privacy and role permissions: never reveal another user's private credentials or unauthorized requests.`;

      const contents: any[] = [];
      const recentTurns = Array.isArray(conversationHistory)
        ? conversationHistory.slice(-8)
        : [];
      for (const turn of recentTurns) {
        if (turn && turn.text && (turn.role === 'user' || turn.role === 'model')) {
          contents.push({
            role: turn.role,
            parts: [{ text: String(turn.text) }],
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: message }],
      });

      const collectedCards: JarvisChemicalCard[] = [];
      let stagedAction: PendingJarvisAction | null = null;
      const executedTools: string[] = [];

      let response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: JARVIS_FUNCTION_DECLARATIONS }],
          temperature: 0.2,
        },
      });

      let loopCount = 0;
      while (
        response.functionCalls &&
        response.functionCalls.length > 0 &&
        loopCount < 4
      ) {
        loopCount += 1;
        const modelContent = response.candidates?.[0]?.content;
        if (modelContent) {
          contents.push(modelContent);
        }

        const functionResponseParts: any[] = [];
        for (const call of response.functionCalls) {
          const fnName = call.name || 'searchChemicals';
          const fnArgs = (call.args as Record<string, any>) || {};
          executedTools.push(fnName);

          let toolExec: JarvisToolExecutionOutput;
          try {
            toolExec = executeJarvisToolCall(fnName, fnArgs, snapshot, user);
          } catch (toolErr: any) {
            toolExec = {
              toolResult: {
                status: 'ERROR',
                error: toolErr?.message || 'Permission or validation error.',
              },
              cards: [],
            };
          }

          if (toolExec.cards && toolExec.cards.length > 0) {
            for (const c of toolExec.cards) {
              if (!collectedCards.some((existing) => existing.containerId === c.containerId)) {
                collectedCards.push(c);
              }
            }
          }
          if (toolExec.pendingAction) {
            stagedAction = toolExec.pendingAction;
          }

          functionResponseParts.push({
            functionResponse: {
              name: fnName,
              response: toolExec.toolResult,
              id: call.id,
            },
          });
        }

        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });

        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: JARVIS_FUNCTION_DECLARATIONS }],
            temperature: 0.2,
          },
        });
      }

      const replyText =
        response.text?.trim() ||
        stagedAction?.readBackPrompt ||
        'I have processed your inventory request.';

      res.json({
        reply: replyText,
        detectedLanguage: detectedLang,
        cards: collectedCards.slice(0, 6),
        pendingAction: stagedAction,
        executedTools,
      });
    } catch (error: any) {
      // Graceful fallback to deterministic inventory engine on network/API error
      try {
        const {
          message = '',
          userContext,
          inventorySnapshot,
          preferredLanguage = 'en',
        } = req.body || {};
        const user: JarvisUserContext = {
          uid: userContext?.uid || 'anon',
          fullName: userContext?.fullName || 'Researcher',
          email: userContext?.email || '',
          role: (userContext?.role as UserRole) || UserRole.PHD_STUDENT,
        };
        const snapshot: JarvisInventorySnapshot = {
          containers: inventorySnapshot?.containers || sharedInventoryState.containers || [],
          products: inventorySnapshot?.products || sharedInventoryState.products || [],
          transactions: inventorySnapshot?.transactions || sharedInventoryState.transactions || [],
          purchaseRequests:
            inventorySnapshot?.purchaseRequests || sharedInventoryState.purchaseRequests || [],
          disposalRequests:
            inventorySnapshot?.disposalRequests || sharedInventoryState.disposalRequests || [],
          adjustmentRequests:
            inventorySnapshot?.adjustmentRequests || sharedInventoryState.adjustmentRequests || [],
          stockRuptureRequests:
            inventorySnapshot?.stockRuptureRequests ||
            sharedInventoryState.stockRuptureRequests ||
            [],
          physicalLocations:
            inventorySnapshot?.physicalLocations || sharedInventoryState.physicalLocations || [],
        };
        const detectedLang = detectLanguageFromText(message, preferredLanguage);
        const fallback = runDeterministicJarvisFallback(
          message,
          snapshot,
          user,
          detectedLang
        );
        res.json({
          reply: fallback.reply,
          detectedLanguage: detectedLang,
          cards: fallback.cards,
          pendingAction: fallback.pendingAction,
          executedTools: fallback.executedTools,
        });
      } catch (innerErr: any) {
        res.status(500).json({
          error: error?.message || 'JARVIS assistant encountered an unexpected error.',
        });
      }
    }
  });

  /**
   * JARVIS Confirmed Stock Action Execution Endpoint (Stage 2 of 2-Step Confirmation)
   */
  app.post('/api/jarvis/execute-action', (req, res) => {
    try {
      const { pendingAction, userContext, inventorySnapshot } = req.body || {};
      if (!pendingAction || !pendingAction.actionId) {
        res.status(400).json({ error: 'Missing pendingAction or actionId.' });
        return;
      }

      const user: JarvisUserContext = {
        uid: userContext?.uid || 'anon',
        fullName: userContext?.fullName || 'Researcher',
        email: userContext?.email || '',
        role: (userContext?.role as UserRole) || UserRole.PHD_STUDENT,
      };

      const snapshot: JarvisInventorySnapshot = {
        containers: inventorySnapshot?.containers || sharedInventoryState.containers || [],
        products: inventorySnapshot?.products || sharedInventoryState.products || [],
        transactions: inventorySnapshot?.transactions || sharedInventoryState.transactions || [],
        purchaseRequests:
          inventorySnapshot?.purchaseRequests || sharedInventoryState.purchaseRequests || [],
        disposalRequests:
          inventorySnapshot?.disposalRequests || sharedInventoryState.disposalRequests || [],
        adjustmentRequests:
          inventorySnapshot?.adjustmentRequests || sharedInventoryState.adjustmentRequests || [],
        stockRuptureRequests:
          inventorySnapshot?.stockRuptureRequests ||
          sharedInventoryState.stockRuptureRequests ||
          [],
        physicalLocations:
          inventorySnapshot?.physicalLocations || sharedInventoryState.physicalLocations || [],
      };

      const result = executeConfirmedJarvisActionOnState(
        snapshot,
        user,
        pendingAction,
        executedJarvisActionIds
      );

      sharedInventoryState = {
        ...sharedInventoryState,
        ...result.updatedSnapshot,
        version: sharedInventoryState.version + 1,
        updatedAt: new Date().toISOString(),
      };

      res.json({
        success: true,
        alreadyExecuted: result.alreadyExecuted,
        confirmationMessage: result.confirmationMessage,
        updatedCard: result.updatedCard || null,
        updatedSnapshot: result.updatedSnapshot,
      });
    } catch (err: any) {
      res.status(403).json({
        success: false,
        error: err?.message || 'Operation could not be completed.',
      });
    }
  });

  /**
   * JARVIS Neural Voice Synthesis Endpoint (Gemini 3.8 Flash Lite TTS)
   * Returns 24kHz PCM base64 audio for lifelike JARVIS vocal responses.
   */
  app.post('/api/jarvis/tts', async (req, res) => {
    try {
      const { text } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Missing text for TTS.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({ error: 'Gemini TTS not configured.' });
        return;
      }

      // Clean markdown symbols before speaking
      const cleanSpeechText = text
        .replace(/[*_`#]/g, '')
        .replace(/→/g, ', ')
        .slice(0, 900);

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [{ parts: [{ text: cleanSpeechText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Charon' },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(500).json({ error: 'No audio data returned from Gemini TTS.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        sampleRate: 24000,
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Gemini TTS synthesis failed.',
      });
    }
  });

  /**
   * AI Chemical Placement & Co-Location Compatibility Detector
   * Analyzes whether a candidate chemical reagent/solvent can safely sit in the same
   * box / cabinet / shelf alongside existing bottles already placed in that zone.
   */
  app.post('/api/ai/check-placement', async (req, res) => {
    try {
      const { candidate, neighbors, placementZone } = req.body;

      if (!candidate || !Array.isArray(neighbors)) {
        res.status(400).json({ error: 'Missing candidate reagent or neighbors array.' });
        return;
      }

      if (neighbors.length === 0) {
        res.json({
          status: 'SAFE',
          summary: `No other chemical containers are currently placed in "${placementZone || 'this storage box/shelf'}". Safe for initial placement.`,
          conflicts: [],
          recommendedBox: candidate.storageRequirements || placementZone || 'Dedicated LCSCO Cabinet',
          aiPowered: true,
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'Gemini API key is not configured on the server.',
        });
        return;
      }

      const prompt = `You are the Principal Chemical Safety Officer at LCSCO (Laboratoire de Catalyse et Synthèse en Chimie Organique).
A researcher is placing or registering a chemical bottle into a specific storage box / cabinet / shelf: "${placementZone}".

CANDIDATE REAGENT TO PLACE:
- Chemical Name: ${candidate.chemicalName}
- Formula: ${candidate.formula || 'N/A'}
- CAS Number: ${candidate.casNumber || 'N/A'}
- GHS Hazard Classes: ${(candidate.hazardClass || []).join(', ')}
- Required Storage Condition: ${candidate.storageRequirements || 'N/A'}

EXISTING REAGENTS ALREADY SITTING IN THIS EXACT PLACEMENT BOX / CABINET (${placementZone}):
${neighbors
  .map(
    (n: any, idx: number) =>
      `${idx + 1}. Bottle ID: ${n.containerId} | Chemical: ${n.chemicalName} (${n.formula || 'N/A'}, CAS ${n.casNumber || 'N/A'}) | Hazards: ${(n.hazardClass || []).join(', ')} | Shelf Position: ${n.locationCode}`
  )
  .join('\n')}

Evaluate strict laboratory chemical storage compatibility rules:
1. Flammables (e.g. Acetone, THF, Hexane, EtOAc) must NOT sit with strong Acids/Corrosives (e.g. HCl, H2SO4, HNO3) or Oxidizers.
2. Water-reactive / Reducing agents (e.g. NaBH4, LiAlH4, NaH) or Pyrophorics (e.g. Pd/C, n-BuLi) must NOT sit with Aqueous Acids, Corrosives, or Halogenated Solvents.
3. Halogenated solvents (e.g. Dichloromethane, Chloroform) should be segregated from reactive metals/strong bases/azides and strong mineral acids.
4. Nitric acid / strong oxidizers must be isolated from organic solvents and reducing agents.

Return a JSON object assessing whether "${candidate.chemicalName}" can safely sit together with the existing bottles in "${placementZone}".`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: {
                type: Type.STRING,
                description: 'Must be one of: SAFE, CAUTION, INCOMPATIBLE',
              },
              summary: {
                type: Type.STRING,
                description: 'Concise 1-2 sentence explanation of why these reagents can or cannot sit together in this placement box.',
              },
              recommendedBox: {
                type: Type.STRING,
                description: 'Recommended LCSCO storage box/cabinet if incompatible or caution (e.g. FLAM-A Flammable Cabinet, ACID-C Acid Cabinet, DESC-1 Dry N2 Desiccator, GLOVE-1 Argon Glovebox).',
              },
              conflicts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    neighborContainerId: { type: Type.STRING },
                    neighborChemicalName: { type: Type.STRING },
                    severity: {
                      type: Type.STRING,
                      description: 'DANGER or WARNING',
                    },
                    chemicalReactionRisk: {
                      type: Type.STRING,
                      description: 'Specific chemical hazard if these two bottles leak or mix in the same cabinet/box (e.g. exothermic reaction, toxic gas, fire, hydrogen evolution).',
                    },
                  },
                  required: [
                    'neighborContainerId',
                    'neighborChemicalName',
                    'severity',
                    'chemicalReactionRisk',
                  ],
                },
              },
            },
            required: ['status', 'summary', 'recommendedBox', 'conflicts'],
          },
        },
      });

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);
      res.json({
        ...parsed,
        aiPowered: true,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error?.message || 'Failed to run Gemini AI chemical compatibility analysis.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LCSCO Inventory server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
