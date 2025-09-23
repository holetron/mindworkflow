import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import Ajv from 'ajv';
import { validateBody } from '../middleware/validateBody';
import { db } from '../db';

export function createIntegrationsRouter(ajv: Ajv): Router {
  const router = Router();

// Schema for a global integration
const globalIntegrationSchema = z.object({
  id: z.string().uuid().optional(), // UUID, optional for creation
  providerId: z.string(),
  name: z.string().min(1, "Integration name cannot be empty"),
  description: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  organization: z.string().optional(),
  webhookContract: z.string().optional(),
  systemPrompt: z.string().optional(),
  inputFields: z.array(z.object({
    id: z.string().optional(),
    label: z.string(),
    key: z.string(),
    type: z.enum(['text', 'textarea']),
    placeholder: z.string().optional(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    defaultValue: z.string().optional(),
  })).optional(),
  exampleRequest: z.object({
    method: z.string(),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(), // JSON string
  }).optional(),
  exampleResponseMapping: z.object({
    incoming: z.record(z.string(), z.string()).optional(),
    outgoing: z.record(z.string(), z.string()).optional(),
  }).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// GET all global integrations
router.get('/', (req, res) => {
  try {
    const integrations = db.prepare('SELECT * FROM global_integrations').all();
    res.json(integrations);
  } catch (error) {
    console.error('Failed to fetch global integrations:', error);
    res.status(500).json({ error: 'Failed to fetch global integrations' });
  }
});

// GET a single global integration by ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const integration = db.prepare('SELECT * FROM global_integrations WHERE id = ?').get(id);
    if (integration) {
      res.json(integration);
    } else {
      res.status(404).json({ error: 'Integration not found' });
    }
  } catch (error) {
    console.error(`Failed to fetch global integration ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch global integration' });
  }
});

// POST create a new global integration
router.post('/', (req, res) => {
  try {
    const newIntegration = req.body;
    const { providerId, name, description, apiKey, baseUrl, organization, webhookContract, systemPrompt, inputFields, exampleRequest, exampleResponseMapping } = newIntegration;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = db.prepare(
      `INSERT INTO global_integrations (id, providerId, name, description, apiKey, baseUrl, organization, webhookContract, systemPrompt, inputFields, exampleRequest, exampleResponseMapping, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    
    stmt.run(
      id,
      providerId,
      name,
      description || null,
      apiKey || null,
      baseUrl || null,
      organization || null,
      webhookContract || null,
      systemPrompt || null,
      JSON.stringify(inputFields || []),
      JSON.stringify(exampleRequest || null),
      JSON.stringify(exampleResponseMapping || null),
      now,
      now
    );
    res.status(201).json({ id, ...newIntegration, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error('Failed to create global integration:', error);
    res.status(500).json({ error: 'Failed to create global integration' });
  }
});

// PUT update a global integration by ID
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updatedFields = req.body;
    const now = new Date().toISOString();

    const setClauses: string[] = [];
    const values: any[] = [];

    for (const key in updatedFields) {
      if (updatedFields.hasOwnProperty(key)) {
        setClauses.push(`${key} = ?`);
        if (['inputFields', 'exampleRequest', 'exampleResponseMapping'].includes(key)) {
          values.push(JSON.stringify(updatedFields[key]));
        } else {
          values.push(updatedFields[key]);
        }
      }
    }
    setClauses.push('updatedAt = ?');
    values.push(now);
    values.push(id); // for WHERE clause

    if (setClauses.length === 1 && setClauses[0] === 'updatedAt = ?') { // Only updatedAt was changed
      return res.status(200).json({ message: 'No fields to update other than updatedAt' });
    }

    const stmt = db.prepare(`UPDATE global_integrations SET ${setClauses.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    if (result.changes > 0) {
      res.status(200).json({ message: 'Integration updated successfully', id, ...updatedFields, updatedAt: now });
    } else {
      res.status(404).json({ error: 'Integration not found or no changes made' });
    }
  } catch (error) {
    console.error(`Failed to update global integration ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update global integration' });
  }
});

// DELETE a global integration by ID
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM global_integrations WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(204).send(); // No content
    } else {
      res.status(404).json({ error: 'Integration not found' });
    }
  } catch (error) {
    console.error(`Failed to delete global integration ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete global integration' });
  }
});

// POST test request for a global integration
router.post('/:id/test-request', (req, res) => {
  try {
    const { id } = req.params;
    const { method, url, headers, body } = req.body; // exampleRequest payload

    const stmt = db.prepare('SELECT * FROM global_integrations WHERE id = ?');
    const integration = stmt.get(id) as any;

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Replace placeholders in URL, headers, and body with actual credentials
    let processedUrl = url;
    let processedHeaders = { ...headers };
    let processedBody = body;

    // Simple placeholder replacement (can be expanded for more complex scenarios)
    const replacePlaceholder = (str: string) => {
      let result = str;
      if (integration.apiKey) result = result.replace(/{API_KEY}/g, integration.apiKey);
      if (integration.baseUrl) result = result.replace(/{BASE_URL}/g, integration.baseUrl);
      if (integration.organization) result = result.replace(/{ORGANIZATION}/g, integration.organization);
      // Add more placeholders as needed
      return result;
    };

    processedUrl = replacePlaceholder(processedUrl);
    for (const key in processedHeaders) {
      if (processedHeaders.hasOwnProperty(key)) {
        processedHeaders[key] = replacePlaceholder(processedHeaders[key]);
      }
    }
    if (processedBody) {
      processedBody = replacePlaceholder(processedBody);
    }

    const fetchOptions: RequestInit = {
      method,
      headers: processedHeaders,
    };

    if (method !== 'GET' && method !== 'HEAD' && processedBody) {
      fetchOptions.body = processedBody;
    }

    fetch(processedUrl, fetchOptions)
      .then(response => {
        if (!response.ok) {
          throw new Error(`External API error: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(responseData => {
        res.json(responseData);
      })
      .catch(error => {
        console.error(`Failed to send test request for integration ${req.params.id}:`, error);
        res.status(500).json({ error: `Failed to send test request: ${error instanceof Error ? error.message : String(error)}` });
      });

  } catch (error) {
    console.error(`Failed to send test request for integration ${req.params.id}:`, error);
    res.status(500).json({ error: `Failed to send test request: ${error instanceof Error ? error.message : String(error)}` });
  }
});

  return router;
}
