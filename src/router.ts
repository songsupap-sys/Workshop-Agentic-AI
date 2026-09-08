import type { Env } from './env';
import { errorJson } from './lib/http';
import { handleChatRoute } from './module-1.1-chat/chat-routes';

export async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === '/api/chat') return handleChatRoute(request, env);
  if (pathname === '/healthz') return new Response('ok', { status: 200 });

  if (env.ASSETS) return env.ASSETS.fetch(request);
  return errorJson('ไม่พบเส้นทางนี้', 404);
}