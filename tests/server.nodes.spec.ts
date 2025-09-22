import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../server/src/index';

const dbPath = path.resolve(__dirname, '../data/localcreativeflow.db');
const baseProjectPath = path.resolve(
  __dirname,
  '../projects/proj_2025_09_19_001/project.flow.json',
);

function prepareFixture() {
  const base = JSON.parse(fs.readFileSync(baseProjectPath, 'utf8'));
  ensureNode(base, {
    node_id: 'n0_html_source',
    type: 'text',
    title: 'HTML Input',
    content_type: 'text/html',
    content:
      '<html><head><title>Demo Chips</title></head><body><a href="https://chips.local">Buy</a></body></html>',
  });
  ensureNode(base, {
    node_id: 'n7_parser_html',
    type: 'parser',
    title: 'HTML Parser',
    parser: { output_schema_ref: 'PARSE_SCHEMA' },
  });
  ensureNode(base, {
    node_id: 'n8_python_normalizer',
    type: 'python',
    title: 'Python Normalizer',
    python: {
      code: `import sys, json\nraw = sys.stdin.read() or '{}';\npayload = json.loads(raw)\ninputs = payload.get('inputs', [])\ntexts = [item.get('content') for item in inputs]\nresult = {"normalized": [t for t in texts if t]}\nprint(json.dumps(result))`,
    },
  });
  ensureNode(base, {
    node_id: 'n9_video_stub',
    type: 'video_gen',
    title: 'Video Previz',
  });
  ensureEdge(base, { from: 'n0_html_source', to: 'n7_parser_html', label: 'html' });
  ensureEdge(base, { from: 'n7_parser_html', to: 'n8_python_normalizer', label: 'json' });
  ensureEdge(base, { from: 'n8_python_normalizer', to: 'n9_video_stub', label: 'video' });
  return base;
}

function ensureNode(base: any, node: any) {
  if (!base.nodes.some((item: any) => item.node_id === node.node_id)) {
    base.nodes.push(node);
  }
}

function ensureEdge(base: any, edge: any) {
  if (!base.edges.some((item: any) => item.from === edge.from && item.to === edge.to)) {
    base.edges.push(edge);
  }
}

describe('Node execution API', () => {
  const project = prepareFixture();

  beforeAll(async () => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    const response = await request(app).post('/api/project').send(project);
    expect(response.status).toBe(201);
  });

  it('initializes default visual properties for imported nodes', async () => {
    const response = await request(app)
      .get(`/api/project/${project.project_id}`)
      .expect(200);

    const nodes: Array<any> = response.body.nodes;
    expect(Array.isArray(nodes)).toBe(true);
    const sample = nodes.find((node) => node.node_id === 'n0_html_source');
    expect(sample).toBeDefined();
    expect(sample.ui).toEqual({
      color: '#6B7280',
      bbox: { x1: 0, y1: 0, x2: 240, y2: 120 },
    });
    expect(sample.ai_visible).toBe(true);
    expect(sample.connections).toEqual({ incoming: [], outgoing: [] });
  });

  it('runs AI planner node and returns PLAN_SCHEMA compliant payload', async () => {
    const response = await request(app)
      .post('/api/node/n2_ai_planner/run')
      .send({ project_id: project.project_id })
      .expect(200);

    expect(response.body.contentType).toBe('application/json');
    const parsed = JSON.parse(response.body.content);
    expect(parsed.overview.goal).toBeTruthy();
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(parsed.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('parses HTML node into PARSE_SCHEMA JSON', async () => {
    const response = await request(app)
      .post('/api/node/n7_parser_html/run')
      .send({ project_id: project.project_id })
      .expect(200);

    expect(response.body.contentType).toBe('application/json');
    const parsed = JSON.parse(response.body.content);
    expect(parsed.title).toBe('Demo Chips');
    expect(parsed.links).toContain('https://chips.local');
  });

  it('executes python sandbox and normalizes JSON', async () => {
    const response = await request(app)
      .post('/api/node/n8_python_normalizer/run')
      .send({ project_id: project.project_id })
      .expect(200);

    const parsed = JSON.parse(response.body.content);
    expect(parsed.normalized).toBeDefined();
  });

  it('runs video generation stub and creates previz file', async () => {
    const response = await request(app)
      .post('/api/node/n9_video_stub/run')
      .send({ project_id: project.project_id })
      .expect(200);

    const videoPath = JSON.parse(response.body.content).path;
    expect(fs.existsSync(videoPath)).toBe(true);
  });

  it('clones node with rerun endpoint', async () => {
    const response = await request(app)
      .post('/api/node/n2_ai_planner/rerun')
      .send({ project_id: project.project_id, clone: true })
      .expect(200);

    expect(response.body.targetNodeId).toMatch(/_clone_001$/);
  });

  it('returns execution logs', async () => {
    const response = await request(app)
      .get(`/api/node/n2_ai_planner/logs?project_id=${project.project_id}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });
});
