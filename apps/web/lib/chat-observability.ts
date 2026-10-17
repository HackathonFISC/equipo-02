import { createHash } from 'node:crypto';

export const CHAT_QUEUE_LIMIT = 1000;
export const CHAT_METRIC_NAMES = [
  'workbridge_chat_queue_depth',
  'workbridge_chat_oldest_job_age_seconds',
  'workbridge_chat_job_attempts_total',
  'workbridge_chat_job_duration_seconds',
  'workbridge_chat_worker_errors_total',
  'workbridge_chat_dead_letters_total',
  'workbridge_chat_session_conflicts_total',
  'workbridge_chat_provider_timeouts_total',
] as const;

export const CHAT_ALERT_RULES = {
  oldestJobAge: { metric: 'workbridge_chat_oldest_job_age_seconds', threshold: 60, forSeconds: 300 },
  workerErrorRate: { metric: 'workbridge_chat_worker_errors_total / workbridge_chat_job_attempts_total', threshold: 0.05, forSeconds: 600 },
} as const;

export interface ChatQueueMetrics {
  queueDepth: number;
  oldestJobAgeSeconds: number;
  attempts: number;
  durationsSeconds: number[];
  workerErrors: number;
  deadLetters: number;
  sessionConflicts: number;
  providerTimeouts: number;
}

const metrics: ChatQueueMetrics = {
  queueDepth: 0, oldestJobAgeSeconds: 0, attempts: 0, durationsSeconds: [],
  workerErrors: 0, deadLetters: 0, sessionConflicts: 0, providerTimeouts: 0,
};
let oldestAgeSince: number | undefined;
let errorRateSince: number | undefined;

/** Stable 64-bit correlation hash; never log the candidate identifier itself. */
export function candidateHash(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 16);
}

export function observeChatQueue(update: Partial<ChatQueueMetrics>, now = Date.now()): void {
  Object.assign(metrics, update);
  if (metrics.oldestJobAgeSeconds > CHAT_ALERT_RULES.oldestJobAge.threshold) oldestAgeSince ??= now;
  else oldestAgeSince = undefined;
}

export function observeChatJob(event: 'attempt' | 'worker_error' | 'dead_letter' | 'session_conflict' | 'provider_timeout' | 'duration', durationSeconds?: number, now = Date.now()): void {
  if (event === 'attempt') metrics.attempts += 1;
  if (event === 'worker_error') metrics.workerErrors += 1;
  if (event === 'dead_letter') metrics.deadLetters += 1;
  if (event === 'session_conflict') metrics.sessionConflicts += 1;
  if (event === 'provider_timeout') metrics.providerTimeouts += 1;
  if (event === 'duration' && durationSeconds !== undefined) metrics.durationsSeconds.push(durationSeconds);
  const errorRate = metrics.attempts > 0 ? metrics.workerErrors / metrics.attempts : 0;
  if (errorRate > CHAT_ALERT_RULES.workerErrorRate.threshold) errorRateSince ??= now;
  else errorRateSince = undefined;
}

export function getChatQueueMetrics(): ChatQueueMetrics {
  return { ...metrics, durationsSeconds: [...metrics.durationsSeconds] };
}

export function evaluateChatAlerts(now = Date.now()): string[] {
  const alerts: string[] = [];
  if (oldestAgeSince !== undefined && now - oldestAgeSince >= CHAT_ALERT_RULES.oldestJobAge.forSeconds * 1000) alerts.push('chat_queue_oldest_job_age');
  if (errorRateSince !== undefined && now - errorRateSince >= CHAT_ALERT_RULES.workerErrorRate.forSeconds * 1000) alerts.push('chat_worker_error_rate');
  return alerts;
}

export function resetChatQueueMetrics(): void {
  Object.assign(metrics, { queueDepth: 0, oldestJobAgeSeconds: 0, attempts: 0, durationsSeconds: [], workerErrors: 0, deadLetters: 0, sessionConflicts: 0, providerTimeouts: 0 });
  oldestAgeSince = undefined;
  errorRateSince = undefined;
}
