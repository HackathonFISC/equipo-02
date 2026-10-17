import { NextResponse } from 'next/server';
import { CHAT_METRIC_NAMES, evaluateChatAlerts, getChatQueueMetrics } from '../../../../../lib/chat-observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Operator-only queue metrics; transcript and candidate identity data never leave this process. */
export function GET(request: Request): Response {
  const expected = process.env.CHAT_METRICS_TOKEN;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const snapshot = getChatQueueMetrics();
  const averageDuration = snapshot.durationsSeconds.length === 0 ? 0 : snapshot.durationsSeconds.reduce((sum, value) => sum + value, 0) / snapshot.durationsSeconds.length;
  const values = [snapshot.queueDepth, snapshot.oldestJobAgeSeconds, snapshot.attempts, averageDuration, snapshot.workerErrors, snapshot.deadLetters, snapshot.sessionConflicts, snapshot.providerTimeouts];
  return NextResponse.json({ metrics: values.map((value, index) => ({ name: CHAT_METRIC_NAMES[index], labels: { service: 'chat' }, value })), alerts: evaluateChatAlerts() });
}
