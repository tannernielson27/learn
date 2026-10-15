import type Anthropic from "@anthropic-ai/sdk";
import { AI_IMPORT_MODEL } from "../config";

/** A Messages API answer, as the SDK returns it, for tests. */
export function reply(
  text: string,
  options: { stop?: string; input?: number; output?: number } = {},
): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: AI_IMPORT_MODEL,
    content: [{ type: "text", text, citations: null }],
    stop_reason: options.stop ?? "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: options.input ?? 100,
      output_tokens: options.output ?? 20,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 10,
    },
  } as unknown as Anthropic.Message;
}
