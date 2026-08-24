import { randomUUID } from "node:crypto";

type GoogleCampaignStatus = "ENABLED" | "PAUSED";

interface GoogleCampaign {
  campaignId: string;
  customerId: string;
  name: string;
  channelType: "SEARCH" | "PERFORMANCE_MAX" | "DISPLAY";
  dailyBudgetUsd: number;
  status: GoogleCampaignStatus;
  ctr: number;
  conversionRate: number;
  costPerConversionUsd: number;
  updatedAt: string;
}

const now = () => new Date().toISOString();

const initialCampaigns: GoogleCampaign[] = [
  {
    campaignId: "gads-cmp-5001",
    customerId: "gads-cust-9001",
    name: "Brand Search - US",
    channelType: "SEARCH",
    dailyBudgetUsd: 95,
    status: "ENABLED",
    ctr: 6.2,
    conversionRate: 8.4,
    costPerConversionUsd: 14.2,
    updatedAt: now(),
  },
  {
    campaignId: "gads-cmp-5002",
    customerId: "gads-cust-9001",
    name: "Competitor Terms - US",
    channelType: "SEARCH",
    dailyBudgetUsd: 70,
    status: "ENABLED",
    ctr: 3.1,
    conversionRate: 4.6,
    costPerConversionUsd: 22.7,
    updatedAt: now(),
  },
  {
    campaignId: "gads-cmp-7101",
    customerId: "gads-cust-1200",
    name: "PMax - DACH",
    channelType: "PERFORMANCE_MAX",
    dailyBudgetUsd: 140,
    status: "PAUSED",
    ctr: 2.8,
    conversionRate: 3.3,
    costPerConversionUsd: 48.5,
    updatedAt: now(),
  },
];

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockGoogleAdsApi {
  private campaigns = new Map<string, GoogleCampaign>();

  constructor() {
    for (const campaign of initialCampaigns) {
      this.campaigns.set(campaign.campaignId, { ...campaign });
    }
  }

  async getCampaignHealth(input: { customerId: string }) {
    await wait(120);
    const campaigns = Array.from(this.campaigns.values()).filter((item) => item.customerId === input.customerId);
    return {
      requestId: `gads-req-${randomUUID().slice(0, 8)}`,
      customerId: input.customerId,
      fetchedAt: now(),
      campaignCount: campaigns.length,
      enabledCampaignCount: campaigns.filter((item) => item.status === "ENABLED").length,
      campaigns,
    };
  }

  async updateCampaignBudget(input: { campaignId: string; newDailyBudgetUsd: number; reason?: string | undefined }) {
    await wait(140);
    const campaign = this.campaigns.get(input.campaignId);
    if (!campaign) {
      throw new Error(`Google campaign not found: ${input.campaignId}`);
    }
    const oldBudget = campaign.dailyBudgetUsd;
    campaign.dailyBudgetUsd = input.newDailyBudgetUsd;
    campaign.updatedAt = now();
    return {
      requestId: `gads-req-${randomUUID().slice(0, 8)}`,
      action: "UPDATE_CAMPAIGN_BUDGET",
      appliedAt: campaign.updatedAt,
      campaignId: campaign.campaignId,
      customerId: campaign.customerId,
      oldDailyBudgetUsd: oldBudget,
      newDailyBudgetUsd: campaign.dailyBudgetUsd,
      reason: input.reason ?? "efficiency_optimization",
    };
  }

  async pauseAllCampaigns(input: { customerId: string; reason?: string | undefined }) {
    await wait(180);
    const matched = Array.from(this.campaigns.values()).filter((item) => item.customerId === input.customerId);
    for (const campaign of matched) {
      campaign.status = "PAUSED";
      campaign.updatedAt = now();
    }
    return {
      requestId: `gads-req-${randomUUID().slice(0, 8)}`,
      action: "PAUSE_ALL_CAMPAIGNS",
      customerId: input.customerId,
      affectedCampaigns: matched.map((item) => item.campaignId),
      reason: input.reason ?? "manual_safety_stop",
      appliedAt: now(),
    };
  }

  async addNegativeKeyword(input: {
    campaignId: string;
    keywordText: string;
    matchType: "EXACT" | "PHRASE" | "BROAD";
  }) {
    await wait(90);
    const campaign = this.campaigns.get(input.campaignId);
    if (!campaign) {
      throw new Error(`Google campaign not found: ${input.campaignId}`);
    }
    return {
      requestId: `gads-req-${randomUUID().slice(0, 8)}`,
      action: "ADD_NEGATIVE_KEYWORD",
      campaignId: campaign.campaignId,
      customerId: campaign.customerId,
      keyword: {
        text: input.keywordText,
        matchType: input.matchType,
      },
      appliedAt: now(),
      status: "SUCCESS",
    };
  }
}
