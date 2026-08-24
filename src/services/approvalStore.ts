import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { ApprovalRecord, ApprovalStatus, Provider, ToolName } from "../types";

interface CreateApprovalInput {
  provider: Provider;
  toolName: ToolName;
  campaignKey: string;
  payload: unknown;
  reason: string;
}

interface ApprovalRow {
  id: string;
  status: ApprovalStatus;
  provider: Provider;
  tool_name: ToolName;
  campaign_key: string;
  payload_json: string;
  reason: string;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  executed_at: string | null;
  execution_result_json: string | null;
  execution_error: string | null;
}

export class ApprovalStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.createTables();
  }

  private createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        campaign_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT,
        decision_note TEXT,
        executed_at TEXT,
        execution_result_json TEXT,
        execution_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
      CREATE INDEX IF NOT EXISTS idx_approvals_campaign_key ON approvals(campaign_key);
    `);
  }

  createPendingApproval(input: CreateApprovalInput): ApprovalRecord {
    const id = `apr_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const payloadJson = JSON.stringify(input.payload);
    const status: ApprovalStatus = "pending";

    this.db
      .prepare(
        `
      INSERT INTO approvals (
        id, status, provider, tool_name, campaign_key, payload_json, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, status, input.provider, input.toolName, input.campaignKey, payloadJson, input.reason, createdAt);

    return this.getById(id)!;
  }

  listApprovals(status?: ApprovalStatus): ApprovalRecord[] {
    if (status) {
      const rows = this.db
        .prepare("SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC")
        .all(status) as ApprovalRow[];
      return rows.map((row) => this.toRecord(row));
    }
    const rows = this.db.prepare("SELECT * FROM approvals ORDER BY created_at DESC").all() as ApprovalRow[];
    return rows.map((row) => this.toRecord(row));
  }

  getById(id: string): ApprovalRecord | null {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as ApprovalRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  findPendingByCampaignKey(campaignKey: string): ApprovalRecord | null {
    const row = this.db
      .prepare("SELECT * FROM approvals WHERE campaign_key = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1")
      .get(campaignKey) as ApprovalRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  approve(id: string, decidedBy: string, note?: string): ApprovalRecord | null {
    const decidedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `
      UPDATE approvals
      SET status = 'approved', decided_at = ?, decided_by = ?, decision_note = ?
      WHERE id = ? AND status = 'pending'
    `,
      )
      .run(decidedAt, decidedBy, note ?? null, id);
    if (result.changes === 0) {
      return null;
    }
    return this.getById(id);
  }

  reject(id: string, decidedBy: string, note?: string): ApprovalRecord | null {
    const decidedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `
      UPDATE approvals
      SET status = 'rejected', decided_at = ?, decided_by = ?, decision_note = ?
      WHERE id = ? AND status = 'pending'
    `,
      )
      .run(decidedAt, decidedBy, note ?? null, id);
    if (result.changes === 0) {
      return null;
    }
    return this.getById(id);
  }

  markExecuted(id: string, result: unknown): ApprovalRecord | null {
    const executedAt = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE approvals
      SET status = 'executed', executed_at = ?, execution_result_json = ?, execution_error = NULL
      WHERE id = ? AND status = 'approved'
    `,
      )
      .run(executedAt, JSON.stringify(result), id);
    return this.getById(id);
  }

  markFailed(id: string, error: string): ApprovalRecord | null {
    const executedAt = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE approvals
      SET status = 'failed', executed_at = ?, execution_error = ?
      WHERE id = ? AND status = 'approved'
    `,
      )
      .run(executedAt, error, id);
    return this.getById(id);
  }

  private toRecord(row: ApprovalRow): ApprovalRecord {
    return {
      id: row.id,
      status: row.status,
      provider: row.provider,
      toolName: row.tool_name,
      campaignKey: row.campaign_key,
      payloadJson: row.payload_json,
      reason: row.reason,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      decidedBy: row.decided_by,
      decisionNote: row.decision_note,
      executedAt: row.executed_at,
      executionResultJson: row.execution_result_json,
      executionError: row.execution_error,
    };
  }
}
