import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const PORT = Number(process.env.PORT) || 3000;

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
    version: 0,
    updatedAt: new Date().toISOString(),
  };

  app.get('/api/shared-state', (_req, res) => {
    res.json(sharedInventoryState);
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
