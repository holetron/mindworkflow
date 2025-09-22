import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createProjectsRouter } from './routes/projects';
import { createNodesRouter } from './routes/nodes';
import { createValidateRouter } from './routes/validate';
import { errorHandler } from './middleware/errorHandler';

const app = express();

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

loadCoreSchemas(ajv);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(morgan('dev'));

const projectsRouter = createProjectsRouter(ajv);

app.use('/api/project', projectsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/node', createNodesRouter(ajv));
app.use('/api/validate', createValidateRouter(ajv));

registerStaticClient(app);

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '0.0.0.0';

if (process.env.JEST_WORKER_ID === undefined) {
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`Local Creative Flow server listening on ${HOST}:${PORT}`);
  });
}

export default app;

function loadCoreSchemas(validator: Ajv): void {
  const schemaDir = path.resolve(__dirname, 'schemas');
  const files = ['PLAN_SCHEMA.json', 'ACTOR_SCHEMA.json', 'PARSE_SCHEMA.json'];
  for (const file of files) {
    const schemaPath = path.join(schemaDir, file);
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(raw);
    const schemaId = path.parse(file).name;
    schema.$id = schemaId;
    validator.addSchema(schema, schemaId);
  }
}

function registerStaticClient(app: express.Express): void {
  const clientDir = path.resolve(process.cwd(), 'app', 'dist');
  const indexPath = path.join(clientDir, 'index.html');
  if (!fs.existsSync(clientDir) || !fs.existsSync(indexPath)) {
    return;
  }

  app.use(express.static(clientDir));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(indexPath);
  });
}
