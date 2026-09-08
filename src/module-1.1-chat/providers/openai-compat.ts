import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';
import { toolFunctionName } from '../types';

type OpenAiMessage = { role: string; content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string };

export async function runOpenAiCompatConversation(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  tools: McpTool[],
  callTool: ToolCaller,
): Promise<ChatTurnResult> {
  if (!baseUrl.trim()) return { reply: 'ยังไม่ได้ตั้งค่า OPENAI_COMPAT_BASE_URL สำหรับ provider นี้', toolTrace: [] };
  if (!apiKey.trim()) return { reply: 'ยังไม่ได้ตั้งค่า API key สำหรับ provider นี้', toolTrace: [] };

  const messages: OpenAiMessage[] = [{ role: 'system', content: systemPrompt }, ...history.map((message) => ({ role: message.role, content: message.content }))];
  const toolTrace: ToolTraceEntry[] = [];
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const openAiTools = tools.map((tool) => ({ type: 'function', function: { name: toolFunctionName(tool), description: tool.description, parameters: tool.inputSchema } }));

  for (let round = 0; round < 4; round += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, ...(openAiTools.length ? { tools: openAiTools, tool_choice: 'auto' } : {}) }),
    });
    const payload = await response.json() as { choices?: Array<{ message?: OpenAiMessage }>; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || `OpenAI-compatible gateway ตอบกลับด้วยสถานะ ${response.status}`);

    const message = payload.choices?.[0]?.message;
    if (!message) return { reply: 'โมเดลไม่ได้ส่งข้อความตอบกลับ', toolTrace };
    if (!message.tool_calls?.length) return { reply: message.content?.trim() || 'โมเดลไม่ได้ส่งข้อความตอบกลับ', toolTrace };
    messages.push(message);

    for (const call of message.tool_calls) {
      const tool = tools.find((candidate) => toolFunctionName(candidate) === call.function.name);
      if (!tool) continue;
      const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      const entry: ToolTraceEntry = { name: call.function.name, arguments: args };
      try {
        entry.result = await callTool(tool, args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(entry.result) });
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: entry.error }) });
      }
      toolTrace.push(entry);
    }
  }
  return { reply: 'การเรียกใช้เครื่องมือใช้จำนวนรอบสูงสุดแล้ว', toolTrace };
}