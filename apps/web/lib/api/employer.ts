import { ApiClientError } from './errors';

const BASE = '/api/applications';
const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export interface DraftFragment {
  source: 'evidence' | 'vacancy' | 'match';
  evidenceIds: string[];
  text: string;
}

export interface ApplicationDocuments {
  cv: DraftFragment[];
  coverLetter: DraftFragment[];
  application: DraftFragment[];
}

/** Submission summary returned by GET /api/applications/submissions. */
export interface EmployerSubmission {
  submissionId: string;
  draftId: string;
  replayed: boolean;
  interview: 'pending_employer_approval' | 'approved' | 'rejected';
  employerOrgId?: string;
  traceId: string;
  vacancyTitle: string;
}

/** Detail returned by GET /api/applications/submissions/:id (candidate-approved evidence only). */
export interface EmployerSubmissionDetail extends EmployerSubmission {
  documents: ApplicationDocuments;
  evidence: { id: string; kind: string; text: string; credentialStatus: string }[];
}

export type InterviewDecision = 'approved' | 'rejected';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) throw await ApiClientError.fromResponse(response);
  return (await response.json()) as T;
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Workflow envelope the runtime validates on every employer decision. */
function actionBody(submission: EmployerSubmissionDetail, reason: string, decision?: InterviewDecision) {
  const idempotencyKey = newKey();
  const traceId = submission.traceId;
  return {
    traceId,
    idempotencyKey,
    reason,
    ...(decision ? { decision } : {}),
    envelope: {
      traceId,
      idempotencyKey,
      agent: 'market_and_matching',
      schemaId: 'application.interview_decision',
      guardrails: [{ stage: 'output', allowed: true, code: 'ok' }],
      dqlState: 'validated',
    },
  };
}

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export async function listPendingSubmissions(): Promise<EmployerSubmission[]> {
  const body = await request<{ submissions: EmployerSubmission[] }>(
    '/submissions?interview=pending_employer_approval',
  );
  return body.submissions;
}

export function readEmployerSubmission(submissionId: string): Promise<EmployerSubmissionDetail> {
  return request<EmployerSubmissionDetail>(`/submissions/${encodeURIComponent(submissionId)}`);
}

/** "Pasar a entrevista": records employer approval, then approves interview progression. */
export async function passToInterview(submission: EmployerSubmissionDetail, reason: string): Promise<EmployerSubmission> {
  const id = encodeURIComponent(submission.submissionId);
  await request(`/submissions/${id}/approvals`, post(actionBody(submission, reason)));
  return request<EmployerSubmission>(`/submissions/${id}/interview`, post(actionBody(submission, reason, 'approved')));
}

/** "No avanza": rejects interview progression with a reason. */
export function declineInterview(submission: EmployerSubmissionDetail, reason: string): Promise<EmployerSubmission> {
  const id = encodeURIComponent(submission.submissionId);
  return request<EmployerSubmission>(`/submissions/${id}/interview`, post(actionBody(submission, reason, 'rejected')));
}
