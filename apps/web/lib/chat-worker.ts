import { randomUUID } from 'node:crypto';
import { createOpenRouterChat, type ChatFn } from '@workbridge/agent-runtime';
import { handleChatTurn, type AsyncChatStore } from './chat-handler';
import { chatSessionStore } from './chat-store';
import type { CandidateContext } from './chat/prompt';
import { getChatJobStore, type ChatJob, type ChatJobError, type ChatJobStore } from './chat-jobs';

/** A claimed job is reclaimable by another worker once this lease elapses. */
export const DEFAULT_LEASE_MS = 30_000;

export interface ChatWorkerDeps {
  jobs?: ChatJobStore;
  sessionStore?: AsyncChatStore;
  chat?: ChatFn;
  context?: CandidateContext;
  contextFor?: (candidateId: string) => CandidateContext | Promise<CandidateContext>;
  leaseOwner?: string;
  leaseMs?: number;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

export interface ChatJobOutcome {
  outcome: 'idle' | 'succeeded' | 'failed' | 'retried';
  jobId?: string;
}

/** Build the shared model seam from the environment; undefined means the deterministic fallback. */
export function createChatFnFromEnv(env: NodeJS.ProcessEnv = process.env): ChatFn | undefined {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) return undefined;
  return createOpenRouterChat({
    apiKey,
    model: env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
    baseUrl: env.OPENROUTER_BASE_URL,
  });
}

async function settle(
  jobs: ChatJobStore,
  job: ChatJob,
  error: ChatJobError,
  log: (entry: Record<string, unknown>) => void,
): Promise<ChatJobOutcome> {
  if (error.retryable && job.attempts < job.maxAttempts) {
    await jobs.release(job.jobId);
    log({ event: 'chat_job_retry', jobId: job.jobId, attempts: job.attempts, code: error.code });
    return { outcome: 'retried', jobId: job.jobId };
  }
  await jobs.fail(job.jobId, error);
  log({ event: 'chat_job_failed', jobId: job.jobId, attempts: job.attempts, code: error.code });
  return { outcome: 'failed', jobId: job.jobId };
}

/**
 * Claim one job with a lease and execute the existing chat seam. The job is
 * acknowledged (marked succeeded) only after `handleChatTurn` committed the
 * optimistic chat session, so a crashed or losing worker never loses a turn.
 */
export async function processOneChatJob(deps: ChatWorkerDeps = {}): Promise<ChatJobOutcome> {
  const jobs = deps.jobs ?? getChatJobStore();
  const sessionStore = deps.sessionStore ?? chatSessionStore;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((entry) => console.info(JSON.stringify(entry)));
  const leaseOwner = deps.leaseOwner ?? `worker-${randomUUID()}`;

  const job = await jobs.claimNext({ leaseOwner, leaseMs: deps.leaseMs ?? DEFAULT_LEASE_MS, now: now() });
  if (!job) return { outcome: 'idle' };

  // Ordered per candidate by session version: a stale action is terminal and never applied twice.
  let currentVersion: number;
  try {
    currentVersion = (await sessionStore.get(job.candidateId))?.version ?? 0;
  } catch {
    return settle(
      jobs,
      job,
      { code: 'persistence_unavailable', message: 'The chat session store is unavailable.', retryable: true },
      log,
    );
  }
  if (currentVersion !== job.sessionVersion) {
    await jobs.fail(job.jobId, {
      code: 'session_version_conflict',
      message: 'The chat session changed before this turn was applied.',
      retryable: false,
    });
    log({ event: 'chat_job_failed', jobId: job.jobId, code: 'session_version_conflict' });
    return { outcome: 'failed', jobId: job.jobId };
  }

  const context = deps.contextFor ? await deps.contextFor(job.candidateId) : deps.context;
  const { status, body } = await handleChatTurn(job.candidateId, job.payload, {
    chat: deps.chat ?? createChatFnFromEnv(),
    store: sessionStore,
    context,
  });

  if (status === 200) {
    await jobs.succeed(job.jobId, body);
    log({ event: 'chat_job_succeeded', jobId: job.jobId, sessionVersion: job.sessionVersion });
    return { outcome: 'succeeded', jobId: job.jobId };
  }
  if (status === 400) {
    return settle(jobs, job, { code: 'invalid_chat_request', message: 'The queued chat action is invalid.', retryable: false }, log);
  }
  if (status === 409) {
    return settle(
      jobs,
      job,
      { code: 'session_version_conflict', message: 'The chat session changed before this turn was applied.', retryable: false },
      log,
    );
  }
  return settle(jobs, job, { code: 'chat_execution_failed', message: 'The chat turn could not be completed.', retryable: true }, log);
}
