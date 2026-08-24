import { randomUUID } from "node:crypto";

type MetaCampaignStatus = "ACTIVE" | "PAUSED";

interface MetaCampaign {
  campaignId: string;
  accountId: string;
  name: string;
  objective: "CONVERSIONS" | "LEADS" | "TRAFFIC";
  dailyBudgetUsd: number;
  status: MetaCampaignStatus;
  cpaUsd: number;
  roas: number;
  spendLast7dUsd: number;
  updatedAt: string;
}

const now = () => new Date().toISOString();

const initialCampaigns: MetaCampaign[] = [
  {
    campaignId: "meta-cmp-101",
    accountId: "meta-act-1001",
    name: "US Prospecting - Video",
    objective: "CONVERSIONS",
    dailyBudgetUsd: 120,
    status: "ACTIVE",
    cpaUsd: 28.4,
    roas: 2.9,
    spendLast7dUsd: 790.25,
    updatedAt: now(),
  },
  {
    campaignId: "meta-cmp-102",
    accountId: "meta-act-1001",
    name: "Retargeting - Cart Abandoners",
    objective: "LEADS",
    dailyBudgetUsd: 65,
    status: "ACTIVE",
    cpaUsd: 19.1,
    roas: 4.1,
    spendLast7dUsd: 451.43,
    updatedAt: now(),
  },
  {
    campaignId: "meta-cmp-201",
    accountId: "meta-act-2007",
    name: "EU Demo Requests",
    objective: "LEADS",
    dailyBudgetUsd: 85,
    status: "PAUSED",
    cpaUsd: 34.8,
    roas: 1.8,
    spendLast7dUsd: 0,
    updatedAt: now(),
  },
];

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockMetaAdsApi {
  private campaigns = new Map<string, MetaCampaign>();

  constructor() {
    for (const campaign of initialCampaigns) {
      this.campaigns.set(campaign.campaignId, { ...campaign });
    }
  }

  async getCampaignOverview(input: { accountId: string }) {
    await wait(120);
    const campaigns = Array.from(this.campaigns.values()).filter((item) => item.accountId === input.accountId);
    return {
      requestId: `meta-req-${randomUUID().slice(0, 8)}`,
      accountId: input.accountId,
      fetchedAt: now(),
      campaignCount: campaigns.length,
      activeCampaignCount: campaigns.filter((item) => item.status === "ACTIVE").length,
      campaigns,
    };
  }

  async updateCampaignBudget(input: { campaignId: string; newDailyBudgetUsd: number; reason?: string | undefined }) {
    await wait(140);
    const campaign = this.campaigns.get(input.campaignId);
    if (!campaign) {
      throw new Error(`Meta campaign not found: ${input.campaignId}`);
    }
    const oldBudget = campaign.dailyBudgetUsd;
    campaign.dailyBudgetUsd = input.newDailyBudgetUsd;
    campaign.updatedAt = now();
    return {
      requestId: `meta-req-${randomUUID().slice(0, 8)}`,
      action: "UPDATE_CAMPAIGN_BUDGET",
      appliedAt: campaign.updatedAt,
      campaignId: campaign.campaignId,
      accountId: campaign.accountId,
      oldDailyBudgetUsd: oldBudget,
      newDailyBudgetUsd: campaign.dailyBudgetUsd,
      reason: input.reason ?? "optimization_adjustment",
    };
  }

  async pauseAllCampaigns(input: { accountId: string; reason?: string | undefined }) {
    await wait(180);
    const matched = Array.from(this.campaigns.values()).filter((item) => item.accountId === input.accountId);
    for (const campaign of matched) {
      campaign.status = "PAUSED";
      campaign.updatedAt = now();
    }
    return {
      requestId: `meta-req-${randomUUID().slice(0, 8)}`,
      action: "PAUSE_ALL_CAMPAIGNS",
      accountId: input.accountId,
      affectedCampaigns: matched.map((item) => item.campaignId),
      reason: input.reason ?? "manual_safety_stop",
      appliedAt: now(),
    };
  }

  async addAudienceExclusion(input: { campaignId: string; audienceId: string; audienceName: string }) {
    await wait(100);
    const campaign = this.campaigns.get(input.campaignId);
    if (!campaign) {
      throw new Error(`Meta campaign not found: ${input.campaignId}`);
    }
    return {
      requestId: `meta-req-${randomUUID().slice(0, 8)}`,
      action: "ADD_AUDIENCE_EXCLUSION",
      campaignId: input.campaignId,
      excludedAudience: {
        audienceId: input.audienceId,
        audienceName: input.audienceName,
      },
      appliedAt: now(),
      status: "SUCCESS",
    };
  }
}
