import { GoogleGenAI, Type } from '@google/genai';
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/ai/status', (_req, res) => {
    res.json({
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.post('/api/ai/review-brief', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in environment secrets. Using built-in rule-based executive analysis.',
      });
      return;
    }

    const requestData = req.body?.request;
    if (!requestData || typeof requestData !== 'object') {
      res.status(400).json({ error: 'Invalid request payload for AI review brief.' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = [
        'Analyze this enterprise operational governance request and return a concise 3-bullet executive review brief.',
        `Request ID: ${requestData.id}`,
        `Title: ${requestData.title}`,
        `Department: ${requestData.department} | Category: ${requestData.category}`,
        `Priority: ${requestData.priority} | Status: ${requestData.status} | Due Date: ${requestData.dueDate} | Overdue: ${Boolean(req.body?.isOverdue)}`,
        `Description: ${requestData.description}`,
        `Deliverable URL: ${requestData.deliverableUrl || 'None provided'}`,
        `Checklist Items: ${JSON.stringify(requestData.checklist || [])}`,
        `Audit History Events (${(requestData.auditTrail || []).length}): ${JSON.stringify(
          (requestData.auditTrail || []).slice(-6),
        )}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an enterprise QA and operational governance reviewer. Be factual, concise, and specific to the provided checklist gates, priority, SLA due date, and audit history. Keep each bullet to 1-2 crisp sentences.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              riskLevel: {
                type: Type.STRING,
                enum: ['Low Risk', 'Elevated Risk', 'Critical SLA Risk'],
              },
              summary: {
                type: Type.STRING,
                description: 'Concise executive summary of operational scope and business impact.',
              },
              completenessStatus: {
                type: Type.STRING,
                description:
                  'Assessment of QA checklist gates, deliverable link, SLA deadline, and audit history.',
              },
              recommendedAction: {
                type: Type.STRING,
                description: 'Concrete next workflow step for the reviewer or owner.',
              },
            },
            required: ['riskLevel', 'summary', 'completenessStatus', 'recommendedAction'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        source: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
        ...parsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini API request failed.';
      res.status(502).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NexOps Enterprise Hub server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
