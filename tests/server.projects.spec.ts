import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../server/src/index';

const dbPath = path.resolve(__dirname, '../data/localcreativeflow.db');
const demoProjectPath = path.resolve(
  __dirname,
  '../projects/proj_2025_09_19_001/project.flow.json',
);

describe('Project API', () => {
  beforeAll(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('imports demo project and retrieves it', async () => {
    const payload = JSON.parse(fs.readFileSync(demoProjectPath, 'utf8'));

    const importResponse = await request(app).post('/api/project').send(payload);
    expect(importResponse.status).toBe(201);
    expect(importResponse.body).toEqual(
      expect.objectContaining({ status: 'imported', project_id: payload.project_id }),
    );

    const getResponse = await request(app).get(`/api/project/${payload.project_id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.nodes.length).toBeGreaterThanOrEqual(payload.nodes.length);
  });

  it('exports project as lcfz archive', async () => {
    const payload = JSON.parse(fs.readFileSync(demoProjectPath, 'utf8'));

    await request(app).post('/api/project').send(payload);
    const response = await request(app)
      .get(`/api/project/${payload.project_id}/export`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/zip/);
    expect(Number(response.headers['content-length'] ?? '0')).toBeGreaterThan(0);
  });
});
