import { MockGoogleAdsApi } from "../mock/googleAdsApi";
import { MockMetaAdsApi } from "../mock/metaAdsApi";
import { ToolExecutionResult, ToolName, Provider } from "../types";
import { ApprovalStore } from "./approvalStore";

interface ToolCallInput {
  id?: string;
  name: string;
  input: unknown;
}

interface PendingPayload {
  toolName: ToolName;
  provider: Provider;
  input: unknown;
}

const HIGH_IMPACT_TOOLS = new Set<ToolName>([
  "meta_update_campaign_budget",
  "meta_pause_all_campaigns",
  "google_update_campaign_budget",
  "google_pause_all_campaigns",
]);

export class ToolExecutor {
  constructor(
    private readonly metaApi: MockMetaAdsApi,
    private readonly googleApi: MockGoogleAdsApi,
    private readonly approvalStore: ApprovalStore,
  ) {}

  async executeFromAgent(toolCall: ToolCallInput): Promise<ToolExecutionResult> {
    const toolName = this.parseToolName(toolCall.name);
    const provider = this.providerFromTool(toolName);
    const campaignKey = this.campaignKeyForTool(toolName, toolCall.input as Record<string, unknown>);

    if (HIGH_IMPACT_TOOLS.has(toolName)) {
      const existing = this.approvalStore.findPendingByCampaignKey(campaignKey);
      if (existing) {
        return {
          status: "blocked_by_pending_approval",
          toolName,
          provider,
          blockedByApprovalId: existing.id,
          campaignKey,
          data: {
            message: "Action blocked because another approval is already pending for this campaign scope.",
          },
        };
      }

      const approval = this.approvalStore.createPendingApproval({
        provider,
        toolName,
        campaignKey,
        payload: {
          toolName,
          provider,
          input: toolCall.input,
        } satisfies PendingPayload,
        reason: "high_impact_action",
      });

      return {
        status: "pending_approval",
        toolName,
        provider,
        approvalId: approval.id,
        campaignKey,
        data: {
          message: "Action requires human approval before execution.",
        },
      };
    }

    try {
      const data = await this.executeImmediate(toolName, toolCall.input as Record<string, unknown>);
      return {
        status: "executed",
        toolName,
        provider,
        campaignKey,
        data,
      };
    } catch (error) {
      return {
        status: "failed",
        toolName,
        provider,
        campaignKey,
        error: this.errorMessage(error),
      };
    }
  }

  async executeApprovedAction(approvalId: string) {
    const approval = this.approvalStore.getById(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }
    if (approval.status === "rejected") {
      return {
        status: "rejected",
        approval,
      };
    }
    if (approval.status === "executed" || approval.status === "failed") {
      return {
        status: approval.status,
        approval,
      };
    }
    if (approval.status !== "approved") {
      throw new Error(`Approval ${approvalId} is not approved yet`);
    }

    const payload = JSON.parse(approval.payloadJson) as PendingPayload;
    try {
      const result = await this.executeImmediate(payload.toolName, payload.input as Record<string, unknown>);
      const updated = this.approvalStore.markExecuted(approvalId, result);
      return {
        status: "executed",
        approval: updated,
        result,
      };
    } catch (error) {
      const updated = this.approvalStore.markFailed(approvalId, this.errorMessage(error));
      return {
        status: "failed",
        approval: updated,
        error: this.errorMessage(error),
      };
    }
  }

  private async executeImmediate(toolName: ToolName, input: Record<string, unknown>) {
    switch (toolName) {
      case "meta_get_campaign_overview":
        return this.metaApi.getCampaignOverview({ accountId: String(input.accountId) });
      case "meta_update_campaign_budget":
        return this.metaApi.updateCampaignBudget({
          campaignId: String(input.campaignId),
          newDailyBudgetUsd: Number(input.newDailyBudgetUsd),
          ...(this.optionalString(input.reason) ? { reason: this.optionalString(input.reason) } : {}),
        });
      case "meta_pause_all_campaigns":
        return this.metaApi.pauseAllCampaigns({
          accountId: String(input.accountId),
          ...(this.optionalString(input.reason) ? { reason: this.optionalString(input.reason) } : {}),
        });
      case "meta_add_audience_exclusion":
        return this.metaApi.addAudienceExclusion({
          campaignId: String(input.campaignId),
          audienceId: String(input.audienceId),
          audienceName: String(input.audienceName),
        });
      case "google_get_campaign_health":
        return this.googleApi.getCampaignHealth({ customerId: String(input.customerId) });
      case "google_update_campaign_budget":
        return this.googleApi.updateCampaignBudget({
          campaignId: String(input.campaignId),
          newDailyBudgetUsd: Number(input.newDailyBudgetUsd),
          ...(this.optionalString(input.reason) ? { reason: this.optionalString(input.reason) } : {}),
        });
      case "google_pause_all_campaigns":
        return this.googleApi.pauseAllCampaigns({
          customerId: String(input.customerId),
          ...(this.optionalString(input.reason) ? { reason: this.optionalString(input.reason) } : {}),
        });
      case "google_add_negative_keyword":
        return this.googleApi.addNegativeKeyword({
          campaignId: String(input.campaignId),
          keywordText: String(input.keywordText),
          matchType: this.matchType(input.matchType),
        });
      default:
        throw new Error(`Unsupported tool: ${toolName}`);
    }
  }

  private parseToolName(name: string): ToolName {
    const allowed: ToolName[] = [
      "meta_get_campaign_overview",
      "meta_update_campaign_budget",
      "meta_pause_all_campaigns",
      "meta_add_audience_exclusion",
      "google_get_campaign_health",
      "google_update_campaign_budget",
      "google_pause_all_campaigns",
      "google_add_negative_keyword",
    ];
    if (!allowed.includes(name as ToolName)) {
      throw new Error(`Unknown tool name: ${name}`);
    }
    return name as ToolName;
  }

  private providerFromTool(toolName: ToolName): Provider {
    return toolName.startsWith("meta_") ? "meta" : "google";
  }

  private campaignKeyForTool(toolName: ToolName, input: Record<string, unknown>) {
    if (toolName === "meta_pause_all_campaigns") {
      return `meta:account:${String(input.accountId)}:all`;
    }
    if (toolName === "google_pause_all_campaigns") {
      return `google:customer:${String(input.customerId)}:all`;
    }
    if (toolName.startsWith("meta_")) {
      return `meta:campaign:${String(input.campaignId ?? "unknown")}`;
    }
    return `google:campaign:${String(input.campaignId ?? "unknown")}`;
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private matchType(value: unknown): "EXACT" | "PHRASE" | "BROAD" {
    if (value === "EXACT" || value === "PHRASE" || value === "BROAD") {
      return value;
    }
    throw new Error("matchType must be EXACT, PHRASE, or BROAD");
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return "Unknown execution error";
  }
}
