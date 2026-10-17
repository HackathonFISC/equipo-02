import { NextResponse } from 'next/server';
import { evaluateChatAlerts, getChatQueueMetrics } from '../../../../../lib/chat-observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Operator-only queue metrics; transcript and candidate identity data never leave this process. */
export function GET(request: Request): Response {
  const expected = process.env.CHAT_METRICS_TOKEN;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ metrics: getChatQueueMetrics(), alerts: evaluateChatAlerts() });
}
