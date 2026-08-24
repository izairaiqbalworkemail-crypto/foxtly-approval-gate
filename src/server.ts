import express, { Express } from "express";
import path from "node:path";
import { MockMetaAdsApi } from "./mock/metaAdsApi";
import { MockGoogleAdsApi } from "./mock/googleAdsApi";
import { ApprovalStore } from "./services/approvalStore";
import { ToolExecutor } from "./services/toolExecutor";
import { ExecutorAgent } from "./agent/executorAgent";
import { ApprovalStatus } from "./types";

interface CreateServerOptions {
  dbPath: string;
  publicDir?: string;
}

export interface ServerContext {
  app: Express;
  approvalStore: ApprovalStore;
  toolExecutor: ToolExecutor;
  metaApi: MockMetaAdsApi;
  googleApi: MockGoogleAdsApi;
}

export function createServer(options: CreateServerOptions): ServerContext {
  const app = express();
  app.use(express.json());

  const approvalStore = new ApprovalStore(options.dbPath);
  const metaApi = new MockMetaAdsApi();
  const googleApi = new MockGoogleAdsApi();
  const toolExecutor = new ToolExecutor(metaApi, googleApi, approvalStore);
  let executorAgent: ExecutorAgent | null = null;

  function getExecutorAgent() {
    if (!executorAgent) {
      executorAgent = new ExecutorAgent(toolExecutor);
    }
    return executorAgent;
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.post("/api/agent/run", async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
    if (!prompt.trim()) {
      res.status(400).json({ error: "Body must include a non-empty prompt string" });
      return;
    }
    try {
      const result = await getExecutorAgent().run(prompt);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Executor run failed" });
    }
  });

  app.get("/api/approvals", (req, res) => {
    const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      statusParam === "pending" ||
      statusParam === "approved" ||
      statusParam === "rejected" ||
      statusParam === "executed" ||
      statusParam === "failed"
        ? (statusParam as ApprovalStatus)
        : undefined;

    const approvals = approvalStore.listApprovals(status);
    res.json({ approvals });
  });

  app.get("/api/approvals/:id", (req, res) => {
    const approval = approvalStore.getById(req.params.id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    res.json({ approval });
  });

  app.post("/api/approvals/:id/approve", async (req, res) => {
    const decidedBy = typeof req.body?.decidedBy === "string" && req.body.decidedBy.trim().length > 0 ? req.body.decidedBy : "reviewer";
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;

    const current = approvalStore.getById(req.params.id);
    if (!current) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }

    if (current.status !== "pending") {
      res.status(409).json({ error: `Approval is already in state ${current.status}` });
      return;
    }

    const approved = approvalStore.approve(req.params.id, decidedBy, note);
    if (!approved) {
      const latest = approvalStore.getById(req.params.id);
      res.status(409).json({ error: `Approval decision conflict. Current state: ${latest?.status ?? "unknown"}` });
      return;
    }

    const execution = await toolExecutor.executeApprovedAction(req.params.id);
    res.json({ approval: approvalStore.getById(req.params.id), execution });
  });

  app.post("/api/approvals/:id/reject", (req, res) => {
    const decidedBy = typeof req.body?.decidedBy === "string" && req.body.decidedBy.trim().length > 0 ? req.body.decidedBy : "reviewer";
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;

    const current = approvalStore.getById(req.params.id);
    if (!current) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }

    if (current.status !== "pending") {
      res.status(409).json({ error: `Approval is already in state ${current.status}` });
      return;
    }

    const rejected = approvalStore.reject(req.params.id, decidedBy, note);
    if (!rejected) {
      const latest = approvalStore.getById(req.params.id);
      res.status(409).json({ error: `Approval decision conflict. Current state: ${latest?.status ?? "unknown"}` });
      return;
    }
    res.json({ approval: rejected, result: { status: "rejected" } });
  });

  if (options.publicDir) {
    app.use(express.static(options.publicDir));
    app.get("/*rest", (_req, res) => {
      res.sendFile(path.join(options.publicDir!, "index.html"));
    });
  }

  return {
    app,
    approvalStore,
    toolExecutor,
    metaApi,
    googleApi,
  };
}
