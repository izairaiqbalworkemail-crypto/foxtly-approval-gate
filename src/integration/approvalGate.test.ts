import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { createServer, ServerContext } from "../server";

function createTestContext(): { ctx: ServerContext; cleanup: () => void } {
  const tempDir = mkdtempSync(path.join(tmpdir(), "foxtly-approval-test-"));
  const dbPath = path.join(tempDir, "approvals.db");
  const ctx = createServer({ dbPath });
  return {
    ctx,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

test("pending action blocks a second conflicting action on same campaign", async () => {
  const { ctx, cleanup } = createTestContext();
  try {
    const first = await ctx.toolExecutor.executeFromAgent({
      name: "meta_update_campaign_budget",
      input: { campaignId: "meta-cmp-101", newDailyBudgetUsd: 170 },
    });
    assert.equal(first.status, "pending_approval");
    assert.ok(first.approvalId);

    const second = await ctx.toolExecutor.executeFromAgent({
      name: "meta_update_campaign_budget",
      input: { campaignId: "meta-cmp-101", newDailyBudgetUsd: 190 },
    });

    assert.equal(second.status, "blocked_by_pending_approval");
    assert.equal(second.blockedByApprovalId, first.approvalId);
  } finally {
    cleanup();
  }
});

test("approve replays the exact original action payload", async () => {
  const { ctx, cleanup } = createTestContext();
  try {
    const pending = await ctx.toolExecutor.executeFromAgent({
      name: "meta_update_campaign_budget",
      input: { campaignId: "meta-cmp-101", newDailyBudgetUsd: 170, reason: "scale winners" },
    });
    assert.equal(pending.status, "pending_approval");
    assert.ok(pending.approvalId);

    const approvalId = pending.approvalId as string;
    const approved = ctx.approvalStore.approve(approvalId, "integration-test");
    assert.ok(approved);

    const execution = await ctx.toolExecutor.executeApprovedAction(approvalId);
    assert.equal(execution.status, "executed");

    const approval = ctx.approvalStore.getById(approvalId);
    assert.equal(approval?.status, "executed");

    const originalPayload = JSON.parse(approval!.payloadJson);
    assert.equal(originalPayload.input.newDailyBudgetUsd, 170);
    assert.equal(originalPayload.input.reason, "scale winners");

    const overview = await ctx.metaApi.getCampaignOverview({ accountId: "meta-act-1001" });
    const campaign = overview.campaigns.find((item) => item.campaignId === "meta-cmp-101");
    assert.equal(campaign?.dailyBudgetUsd, 170);
  } finally {
    cleanup();
  }
});

test("reject leaves no side effect on campaign budget", async () => {
  const { ctx, cleanup } = createTestContext();
  try {
    const before = await ctx.metaApi.getCampaignOverview({ accountId: "meta-act-1001" });
    const beforeBudget = before.campaigns.find((item) => item.campaignId === "meta-cmp-101")?.dailyBudgetUsd;
    assert.equal(beforeBudget, 120);

    const pending = await ctx.toolExecutor.executeFromAgent({
      name: "meta_update_campaign_budget",
      input: { campaignId: "meta-cmp-101", newDailyBudgetUsd: 333 },
    });
    assert.equal(pending.status, "pending_approval");
    assert.ok(pending.approvalId);

    const approvalId = pending.approvalId as string;
    const rejected = ctx.approvalStore.reject(approvalId, "integration-test", "too risky");
    assert.equal(rejected?.status, "rejected");

    const execution = await ctx.toolExecutor.executeApprovedAction(approvalId);
    assert.equal(execution.status, "rejected");

    const after = await ctx.metaApi.getCampaignOverview({ accountId: "meta-act-1001" });
    const afterBudget = after.campaigns.find((item) => item.campaignId === "meta-cmp-101")?.dailyBudgetUsd;
    assert.equal(afterBudget, 120);
  } finally {
    cleanup();
  }
});

test("double approve request returns conflict on second request", async () => {
  const { ctx, cleanup } = createTestContext();
  try {
    const pending = await ctx.toolExecutor.executeFromAgent({
      name: "meta_update_campaign_budget",
      input: { campaignId: "meta-cmp-101", newDailyBudgetUsd: 175 },
    });
    assert.equal(pending.status, "pending_approval");
    const approvalId = pending.approvalId as string;

    const [first, second] = await Promise.all([
      request(ctx.app).post(`/api/approvals/${approvalId}/approve`).send({ decidedBy: "alice" }),
      request(ctx.app).post(`/api/approvals/${approvalId}/approve`).send({ decidedBy: "bob" }),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409]);

    const final = ctx.approvalStore.getById(approvalId);
    assert.equal(final?.status, "executed");
  } finally {
    cleanup();
  }
});
