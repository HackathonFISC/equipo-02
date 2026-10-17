import { describe, expect, it, beforeEach } from 'vitest';
import { candidateHash, evaluateChatAlerts, getChatQueueMetrics, observeChatJob, observeChatQueue, resetChatQueueMetrics } from '../lib/chat-observability';

describe('chat observability', () => {
  beforeEach(() => resetChatQueueMetrics());

  it('uses stable redacted candidate hashes and exposes all metric fields', () => {
    expect(candidateHash('candidate-a')).toHaveLength(16);
    expect(candidateHash('candidate-a')).toBe(candidateHash('candidate-a'));
    expect(candidateHash('candidate-a')).not.toContain('candidate-a');
    expect(Object.keys(getChatQueueMetrics())).toEqual(expect.arrayContaining(['queueDepth', 'oldestJobAgeSeconds', 'attempts', 'durationsSeconds', 'workerErrors', 'deadLetters', 'sessionConflicts', 'providerTimeouts']));
  });

  it('requires the configured alert windows', () => {
    observeChatQueue({ oldestJobAgeSeconds: 61 }, 0);
    observeChatJob('attempt', undefined, 0);
    observeChatJob('worker_error', undefined, 0);
    expect(evaluateChatAlerts(299_999)).toEqual([]);
    expect(evaluateChatAlerts(300_000)).toContain('chat_queue_oldest_job_age');
    expect(evaluateChatAlerts(599_999)).not.toContain('chat_worker_error_rate');
    expect(evaluateChatAlerts(600_000)).toContain('chat_worker_error_rate');
  });
});
