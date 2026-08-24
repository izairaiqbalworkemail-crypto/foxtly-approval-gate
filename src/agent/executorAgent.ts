import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { TOOL_DEFINITIONS } from "./toolDefinitions";
import { ToolExecutor } from "../services/toolExecutor";

interface RunResult {
  finalText: string;
  turns: number;
  toolEvents: Array<{
    toolUseId: string;
    toolName: string;
    result: unknown;
  }>;
}

export class ExecutorAgent {
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(private readonly toolExecutor: ToolExecutor) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    this.anthropic = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  }

  async run(userPrompt: string): Promise<RunResult> {
    const system = [
      "You are an ad operations executor.",
      "Use tools to inspect and apply campaign actions on Meta and Google Ads.",
      "If a tool returns pending_approval or blocked_by_pending_approval, explain that status and continue with safer actions when possible.",
      "Only claim an action is applied when tool_result reports executed.",
    ].join(" ");

    const messages: MessageParam[] = [
      {
        role: "user",
        content: userPrompt,
      },
    ];

    const toolEvents: RunResult["toolEvents"] = [];
    let finalText = "";
    const maxTurns = 8;

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 900,
        system,
        tools: [...TOOL_DEFINITIONS],
        messages,
      });

      messages.push({
        role: "assistant",
        content: response.content,
      });

      const toolUses = response.content.filter((block) => block.type === "tool_use");
      const textBlocks = response.content.filter((block) => block.type === "text");
      if (textBlocks.length > 0) {
        finalText = textBlocks.map((block) => block.text).join("\n");
      }

      if (toolUses.length === 0) {
        return {
          finalText,
          turns: turn,
          toolEvents,
        };
      }

      const toolResults = [] as Array<{ type: "tool_result"; tool_use_id: string; content: string }>;

      for (const toolUse of toolUses) {
        const result = await this.toolExecutor.executeFromAgent({
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        });

        toolEvents.push({
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          result,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({
        role: "user",
        content: toolResults,
      });
    }

    return {
      finalText: `${finalText}\n\nStopped after max turns (${maxTurns}).`,
      turns: maxTurns,
      toolEvents,
    };
  }
}
