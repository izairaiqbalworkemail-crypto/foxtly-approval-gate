import { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "meta_get_campaign_overview",
    description: "Fetches Meta campaign performance overview for an ad account.",
    input_schema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "meta_update_campaign_budget",
    description: "Updates the daily budget of a Meta campaign in USD.",
    input_schema: {
      type: "object",
      properties: {
        campaignId: { type: "string" },
        newDailyBudgetUsd: { type: "number" },
        reason: { type: "string" },
      },
      required: ["campaignId", "newDailyBudgetUsd"],
    },
  },
  {
    name: "meta_pause_all_campaigns",
    description: "Pauses all Meta campaigns under an account.",
    input_schema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "meta_add_audience_exclusion",
    description: "Adds an audience exclusion to a Meta campaign.",
    input_schema: {
      type: "object",
      properties: {
        campaignId: { type: "string" },
        audienceId: { type: "string" },
        audienceName: { type: "string" },
      },
      required: ["campaignId", "audienceId", "audienceName"],
    },
  },
  {
    name: "google_get_campaign_health",
    description: "Fetches Google Ads campaign health snapshot for a customer.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
      },
      required: ["customerId"],
    },
  },
  {
    name: "google_update_campaign_budget",
    description: "Updates the daily budget of a Google campaign in USD.",
    input_schema: {
      type: "object",
      properties: {
        campaignId: { type: "string" },
        newDailyBudgetUsd: { type: "number" },
        reason: { type: "string" },
      },
      required: ["campaignId", "newDailyBudgetUsd"],
    },
  },
  {
    name: "google_pause_all_campaigns",
    description: "Pauses all Google campaigns under a customer.",
    input_schema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["customerId"],
    },
  },
  {
    name: "google_add_negative_keyword",
    description: "Adds a negative keyword to a Google campaign.",
    input_schema: {
      type: "object",
      properties: {
        campaignId: { type: "string" },
        keywordText: { type: "string" },
        matchType: { type: "string", enum: ["EXACT", "PHRASE", "BROAD"] },
      },
      required: ["campaignId", "keywordText", "matchType"],
    },
  },
];
