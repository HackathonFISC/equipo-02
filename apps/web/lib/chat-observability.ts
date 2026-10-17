import { createHash } from 'node:crypto';

export const CHAT_QUEUE_LIMIT = 1000;
export const CHAT_METRIC_NAMES = ['workbridge_chat_queue_depth', 'workbridge_chat_oldest_job_age_seconds', 'workbridge_chat_job_attempts_total', 'workbridge_chat_job_duration_seconds', 'workbridge_chat_worker_errors_total', 'workbridge_chat_dead_letters_total', 'workbridge_chat_session_conflicts_total', 'workbridge_chat_provider_timeouts_total'] as const;
export const CHAT_ALERT_RULES = { oldestJobAge: { metric: 'workbridge_chat_oldest_job_age_seconds', threshold: 60, forSeconds: 300 }, workerErrorRate: { metric: 'workbridge_chat_worker_errors_total / workbridge_chat_job_attempts_total', threshold: 0.05, forSeconds: 600 } } as const;
export interface ChatQueueMetrics { queueDepth: number; oldestJobAgeSeconds: number; attempts: number; durationsSeconds: number[]; workerErrors: number; deadLetters: number; sessionConflicts: number; providerTimeouts: number }
const metrics: ChatQueueMetrics = { queueDepth: 0, oldestJobAgeSeconds: 0, attempts: 0, durationsSeconds: [], workerErrors: 0, deadLetters: 0, sessionConflicts: 0, providerTimeouts: 0 };
export function candidateHash(id: string): string { return createHash('sha256').update(id).digest('hex').slice(0, 16); }
export function observeChatQueue(update: Partial<ChatQueueMetrics>): void { Object.assign(metrics, update); }
export function observeChatJob(event: 'attempt' | 'worker_error' | 'dead_letter' | 'session_conflict' | 'provider_timeout' | 'duration', durationSeconds?: number): void { if (event === 'attempt') metrics.attempts++; if (event === 'worker_error') metrics.workerErrors++; if (event === 'dead_letter') metrics.deadLetters++; if (event === 'session_conflict') metrics.sessionConflicts++; if (event === 'provider_timeout') metrics.providerTimeouts++; if (event === 'duration' && durationSeconds !== undefined) metrics.durationsSeconds.push(durationSeconds); }
export function getChatQueueMetrics(): ChatQueueMetrics { return { ...metrics, durationsSeconds: [...metrics.durationsSeconds] }; }
export function evaluateChatAlerts(snapshot = metrics): string[] { const alerts: string[] = []; if (snapshot.oldestJobAgeSeconds > 60) alerts.push('chat_queue_oldest_job_age'); if (snapshot.attempts > 0 && snapshot.workerErrors / snapshot.attempts > 0.05) alerts.push('chat_worker_error_rate'); return alerts; }
export function resetChatQueueMetrics(): void { Object.assign(metrics, { queueDepth: 0, oldestJobAgeSeconds: 0, attempts: 0, durationsSeconds: [], workerErrors: 0, deadLetters: 0, sessionConflicts: 0, providerTimeouts: 0 }); }
