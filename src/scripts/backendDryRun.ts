import "dotenv/config";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import request from "supertest";
import { createServer } from "../server";
import { TOOL_DEFINITIONS } from "../agent/toolDefinitions";

function line(title: string, value: unknown) {
  process.stdout.write(`\n${title}\n${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "foxtly-dry-run-"));
  const dbPath = path.join(tempDir, "approvals.db");

  const { app, approvalStore, toolExecutor, metaApi } = createServer({ dbPath });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY in environment. Add it to .env and retry.");
    }

    const anthropic = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
    const prompt =
      "Execute this now: set Meta campaign meta-cmp-101 daily budget to 60 USD with reason 'reduce spend by 50%'";

    console.log("Calling real Anthropic API...");
    const response = await anthropic.messages.create({
      model,
      max_tokens: 700,
      system:
        "You are an ad operations executor. You must use one available tool call to perform the requested action when a direct actionable request is given.",
      tools: [...TOOL_DEFINITIONS],
      tool_choice: { type: "tool", name: "meta_update_campaign_budget" },
      messages: [{ role: "user", content: prompt }],
    });
    console.log("Raw Anthropic response object:", response);

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) {
      throw new Error("Anthropic response did not include a tool_use block.");
    }

    line("1) Real raw tool_use block", toolUse);

    const gatedResult = await toolExecutor.executeFromAgent({
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    });
    line("2) Gate interception tool_result to Claude", gatedResult);

    if (!gatedResult.approvalId) {
      throw new Error("Expected pending approval id");
    }

    const pendingRow = approvalStore.getById(gatedResult.approvalId);
    line("3) SQLite row created", pendingRow);

    const approveFirst = await request(app)
      .post(`/api/approvals/${gatedResult.approvalId}/approve`)
      .send({ decidedBy: "reviewer-a" });
    line("4) First approve response", { status: approveFirst.status, body: approveFirst.body });

    const approveSecond = await request(app)
      .post(`/api/approvals/${gatedResult.approvalId}/approve`)
      .send({ decidedBy: "reviewer-b" });
    line("5) Second approve response (should be 409)", { status: approveSecond.status, body: approveSecond.body });

    const beforeReject = await metaApi.getCampaignOverview({ accountId: "meta-act-1001" });
    const beforeBudget = beforeReject.campaigns.find((c) => c.campaignId === "meta-cmp-102")?.dailyBudgetUsd;

    const rejectCandidate = await toolExecutor.executeFromAgent({
      name: "meta_update_campaign_budget",
      input: {
        campaignId: "meta-cmp-102",
        newDailyBudgetUsd: 15,
        reason: "aggressive cut",
      },
    });
    if (!rejectCandidate.approvalId) {
      throw new Error("Expected pending approval for reject scenario");
    }

    const rejectResponse = await request(app)
      .post(`/api/approvals/${rejectCandidate.approvalId}/reject`)
      .send({ decidedBy: "reviewer-c", note: "too risky" });
    line("6) Reject response", { status: rejectResponse.status, body: rejectResponse.body });

    const afterReject = await metaApi.getCampaignOverview({ accountId: "meta-act-1001" });
    const afterBudget = afterReject.campaigns.find((c) => c.campaignId === "meta-cmp-102")?.dailyBudgetUsd;
    line("7) Reject side-effect check", {
      campaignId: "meta-cmp-102",
      beforeBudget,
      afterBudget,
      unchanged: beforeBudget === afterBudget,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

void main();
