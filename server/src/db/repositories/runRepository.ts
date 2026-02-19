// runRepository.ts — Execution log operations
import { db } from '../connection';
import type { RunRecord } from '../types';

export function storeRun(run: RunRecord): void {
  db.prepare(
    `INSERT INTO runs (run_id, project_id, node_id, started_at, finished_at, status, input_hash, output_hash, logs_json)
     VALUES (@run_id, @project_id, @node_id, @started_at, @finished_at, @status, @input_hash, @output_hash, @logs_json)`,
  ).run(run);
}

export function getNodeRuns(projectId: string, nodeId: string): RunRecord[] {
  const rows = db
    .prepare(
      `SELECT run_id, project_id, node_id, started_at, finished_at, status, input_hash, output_hash, logs_json
       FROM runs WHERE project_id = ? AND node_id = ? ORDER BY started_at DESC`,
    )
    .all(projectId, nodeId) as Array<{
    run_id: string;
    project_id: string;
    node_id: string;
    started_at: string;
    finished_at: string;
    status: string;
    input_hash: string;
    output_hash: string;
    logs_json: string;
  }>;

  return rows.map((row) => ({
    ...row,
    logs_json: row.logs_json,
  }));
}
