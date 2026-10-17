import { NextResponse } from 'next/server';
import { CHAT_METRIC_NAMES, evaluateChatAlerts, getChatQueueMetrics } from '../../../../../lib/chat-observability';
import { createNeonChatJobQuery } from '../../../../../lib/chat-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Operator-only queue metrics; transcript and candidate identity data never leave this process. */
export async function GET(request: Request): Promise<Response> {
  const expected = process.env.CHAT_METRICS_TOKEN;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let snapshot = getChatQueueMetrics();
  if (process.env.WORKBRIDGE_PERSISTENCE !== 'memory') {
    try {
      const query = createNeonChatJobQuery();
      const [queue, totals] = await Promise.all([
        query("select count(*)::int as depth, coalesce(extract(epoch from (now() - min(created_at))), 0)::int as oldest from chat_jobs where status = 'queued'", []),
        query("select attempts, worker_errors, dead_letters, session_conflicts, provider_timeouts, duration_seconds_total, duration_samples from chat_queue_metrics where metric_key = 'chat'", []),
      ]);
      const row = totals.rows[0] ?? {};
      snapshot = { queueDepth: Number(queue.rows[0]?.depth ?? 0), oldestJobAgeSeconds: Number(queue.rows[0]?.oldest ?? 0), attempts: Number(row.attempts ?? 0), durationsSeconds: Number(row.duration_samples ?? 0) > 0 ? [Number(row.duration_seconds_total ?? 0) / Number(row.duration_samples)] : [], workerErrors: Number(row.worker_errors ?? 0), deadLetters: Number(row.dead_letters ?? 0), sessionConflicts: Number(row.session_conflicts ?? 0), providerTimeouts: Number(row.provider_timeouts ?? 0) };
    } catch {
      return NextResponse.json({ error: 'metrics_unavailable' }, { status: 503 });
    }
  }
  const averageDuration = snapshot.durationsSeconds.length === 0 ? 0 : snapshot.durationsSeconds.reduce((sum, value) => sum + value, 0) / snapshot.durationsSeconds.length;
  const values = [snapshot.queueDepth, snapshot.oldestJobAgeSeconds, snapshot.attempts, averageDuration, snapshot.workerErrors, snapshot.deadLetters, snapshot.sessionConflicts, snapshot.providerTimeouts];
  return NextResponse.json({ metrics: values.map((value, index) => ({ name: CHAT_METRIC_NAMES[index], labels: { service: 'chat' }, value })), alerts: evaluateChatAlerts() });
}
