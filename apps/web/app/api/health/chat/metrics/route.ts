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
  let persistedAlerts: string[] = [];
  if (process.env.WORKBRIDGE_PERSISTENCE !== 'memory') {
    try {
      const query = createNeonChatJobQuery();
      const [queue, totals, alertsResult] = await Promise.all([
        query("select count(*)::int as depth, coalesce(extract(epoch from (now() - min(created_at))), 0)::int as oldest from chat_jobs where status = 'queued'", []),
        query("select attempts, worker_errors, dead_letters, session_conflicts, provider_timeouts, duration_seconds_total, duration_samples from chat_queue_metrics where metric_key = 'chat'", []),
        query("select exists(select 1 from chat_jobs where status = 'queued' and created_at <= now() - interval '5 minutes') as oldest_alert, (select count(*) from chat_jobs where attempts > 0 and updated_at >= now() - interval '10 minutes') > 0 and (select count(*) from chat_jobs where status = 'failed' and updated_at >= now() - interval '10 minutes')::decimal / greatest((select count(*) from chat_jobs where attempts > 0 and updated_at >= now() - interval '10 minutes'), 1) > 0.05 as error_alert", []),
      ]);
      const row = totals.rows[0] ?? {};
      persistedAlerts = [alertsResult.rows[0]?.oldest_alert ? 'chat_queue_oldest_job_age' : null, alertsResult.rows[0]?.error_alert ? 'chat_worker_error_rate' : null].filter((value): value is string => value !== null);
      snapshot = { queueDepth: Number(queue.rows[0]?.depth ?? 0), oldestJobAgeSeconds: Number(queue.rows[0]?.oldest ?? 0), attempts: Number(row.attempts ?? 0), durationsSeconds: Number(row.duration_samples ?? 0) > 0 ? [Number(row.duration_seconds_total ?? 0) / Number(row.duration_samples)] : [], workerErrors: Number(row.worker_errors ?? 0), deadLetters: Number(row.dead_letters ?? 0), sessionConflicts: Number(row.session_conflicts ?? 0), providerTimeouts: Number(row.provider_timeouts ?? 0) };
    } catch {
      return NextResponse.json({ error: 'metrics_unavailable' }, { status: 503 });
    }
  }
  const averageDuration = snapshot.durationsSeconds.length === 0 ? 0 : snapshot.durationsSeconds.reduce((sum, value) => sum + value, 0) / snapshot.durationsSeconds.length;
  const values = [snapshot.queueDepth, snapshot.oldestJobAgeSeconds, snapshot.attempts, averageDuration, snapshot.workerErrors, snapshot.deadLetters, snapshot.sessionConflicts, snapshot.providerTimeouts];
  const dbAlerts = process.env.WORKBRIDGE_PERSISTENCE === 'memory' ? evaluateChatAlerts() : persistedAlerts;
  return NextResponse.json({ metrics: values.map((value, index) => ({ name: CHAT_METRIC_NAMES[index], labels: { service: 'chat' }, value })), alerts: dbAlerts });
}
