export type Provider = "meta" | "google";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export type ToolName =
  | "meta_get_campaign_overview"
  | "meta_update_campaign_budget"
  | "meta_pause_all_campaigns"
  | "meta_add_audience_exclusion"
  | "google_get_campaign_health"
  | "google_update_campaign_budget"
  | "google_pause_all_campaigns"
  | "google_add_negative_keyword";

export interface ApprovalRecord {
  id: string;
  status: ApprovalStatus;
  provider: Provider;
  toolName: ToolName;
  campaignKey: string;
  payloadJson: string;
  reason: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  executedAt: string | null;
  executionResultJson: string | null;
  executionError: string | null;
}

export interface ToolExecutionResult {
  status: "executed" | "pending_approval" | "blocked_by_pending_approval" | "rejected" | "failed";
  toolName: ToolName;
  provider: Provider;
  approvalId?: string;
  blockedByApprovalId?: string;
  campaignKey: string;
  data?: unknown;
  error?: string;
}
