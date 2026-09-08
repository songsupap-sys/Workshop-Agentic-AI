import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';
import { toolFunctionName } from '../types';
import { toGeminiSchema } from '../tool-schema';

type GeminiPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } };
type GeminiContent = { role?: string; parts: GeminiPart[] };

export async function runGeminiConversation(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  tools: McpTool[],
  callTool: ToolCaller,
): Promise<ChatTurnResult> {
  if (!apiKey.trim()) return { reply: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY สำหรับ provider นี้', toolTrace: [] };

  const contents: GeminiContent[] = history.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  const toolTrace: ToolTraceEntry[] = [];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const geminiTools = tools.length
    ? [{ functionDeclarations: tools.map((tool) => ({ name: toolFunctionName(tool), description: tool.description, parameters: toGeminiSchema(tool.inputSchema) })) }]
    : undefined;

  for (let round = 0; round < 4; round += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents, ...(geminiTools ? { tools: geminiTools } : {}) }),
    });
    const payload = await response.json() as { candidates?: Array<{ content?: GeminiContent }>; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || `Gemini ตอบกลับด้วยสถานะ ${response.status}`);

    const parts = payload.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((part) => part.functionCall).map((part) => part.functionCall!);
    if (!calls.length) return { reply: parts.map((part) => part.text || '').join('').trim() || 'โมเดลไม่ได้ส่งข้อความตอบกลับ', toolTrace };

    contents.push({ role: 'model', parts });
    for (const call of calls) {
      const tool = tools.find((candidate) => toolFunctionName(candidate) === call.name);
      if (!tool) continue;
      const entry: ToolTraceEntry = { name: call.name, arguments: call.args || {} };
      try {
        entry.result = await callTool(tool, call.args || {});
        contents.push({ role: 'user', parts: [{ text: JSON.stringify({ tool: call.name, result: entry.result }) }] });
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        contents.push({ role: 'user', parts: [{ text: JSON.stringify({ tool: call.name, error: entry.error }) }] });
      }
      toolTrace.push(entry);
    }
  }
  return { reply: 'การเรียกใช้เครื่องมือใช้จำนวนรอบสูงสุดแล้ว', toolTrace };
}