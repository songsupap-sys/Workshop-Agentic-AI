import type { Env } from '../../env';
import { errorJson, json } from '../../lib/http';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';
import type { ChatMessage, ChatProvider, ChatTurnResult, McpTool, ToolCaller } from './types';

type ChatRequest = { message?: unknown; history?: unknown; provider?: unknown; model?: unknown };
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODELS: Record<ChatProvider, string> = { gemini: 'gemini-flash-latest', openai: 'gpt-4o-mini', 'openai-compat': 'gpt-4o-mini' };

export function buildSystemPrompt(): string {
  return 'คุณคือผู้ช่วย AI ของระบบ AI Desk ตอบคำถามอย่างสุภาพ กระชับ และเป็นประโยชน์ โดยตอบเป็นภาษาไทยเมื่อผู้ใช้สื่อสารภาษาไทย';
}
export function resolveProvider(value: unknown, env: Env): ChatProvider {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : env.DEFAULT_CHAT_PROVIDER;
  return candidate === 'openai' || candidate === 'openai-compat' || candidate === 'gemini' ? candidate : 'gemini';
}
export function defaultModelFor(provider: ChatProvider, env: Env): string {
  if (provider === 'gemini') return env.GEMINI_MODEL?.trim() || DEFAULT_MODELS.gemini;
  if (provider === 'openai') return env.OPENAI_MODEL?.trim() || DEFAULT_MODELS.openai;
  return env.OPENAI_COMPAT_MODEL?.trim() || DEFAULT_MODELS['openai-compat'];
}
function resolveApiKey(provider: ChatProvider, env: Env): string {
  return provider === 'gemini' ? env.GEMINI_API_KEY || '' : provider === 'openai' ? env.OPENAI_API_KEY || '' : env.OPENAI_COMPAT_API_KEY || '';
}
function resolveBaseUrl(provider: ChatProvider, env: Env): string { return provider === 'openai' ? OPENAI_BASE_URL : env.OPENAI_COMPAT_BASE_URL || ''; }
function resolveTools(): { tools: McpTool[]; callTool: ToolCaller } { return { tools: [], callTool: async () => undefined }; }
function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string';
}
function readHistory(value: unknown): ChatMessage[] { return Array.isArray(value) ? value.filter(isChatMessage).slice(-50) : []; }

export async function runChatTurn(provider: ChatProvider, model: string, message: string, history: ChatMessage[], env: Env): Promise<ChatTurnResult> {
  const messages = [...history, { role: 'user' as const, content: message }];
  const { tools, callTool } = resolveTools();
  if (provider === 'gemini') return runGeminiConversation(resolveApiKey(provider, env), model, buildSystemPrompt(), messages, tools, callTool);
  return runOpenAiCompatConversation(resolveBaseUrl(provider, env), resolveApiKey(provider, env), model, buildSystemPrompt(), messages, tools, callTool);
}

export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('กรุณาใช้เมธอด POST', 405);
  let body: ChatRequest;
  try { body = await request.json() as ChatRequest; } catch { return errorJson('ข้อมูล JSON ไม่ถูกต้อง', 400); }
  if (typeof body.message !== 'string' || !body.message.trim()) return errorJson('กรุณาระบุ message', 400);
  const provider = resolveProvider(body.provider, env);
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModelFor(provider, env);
  try {
    const result = await runChatTurn(provider, model, body.message.trim(), readHistory(body.history), env);
    return json({ reply: result.reply, provider, model, toolTrace: result.toolTrace });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
    return json({ reply: `ไม่สามารถติดต่อ provider ได้: ${message}`, provider, model, toolTrace: [] }, 502);
  }
}