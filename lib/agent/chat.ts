// ─── Chat Agent (Single Responsibility: agentic loop orchestration) ───────────

import Anthropic from '@anthropic-ai/sdk';
import { agentTools, AGENT_SYSTEM_PROMPT } from './tools';
import { executeTool } from './executor';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ChatResult {
  role: 'assistant';
  content: string;
}

export async function runChatAgent(messages: Anthropic.MessageParam[]): Promise<ChatResult> {
  let currentMessages = [...messages];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: AGENT_SYSTEM_PROMPT,
      tools: agentTools,
      messages: currentMessages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      return { role: 'assistant', content: text };
    }

    if (response.stop_reason === 'tool_use') {
      currentMessages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: executeTool(b.name, b.input as Record<string, unknown>),
        }));

      currentMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  throw new Error('Unexpected agent state');
}
