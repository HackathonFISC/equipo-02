import { describe, expect, it, vi } from "vitest";
import type { MatchDecision } from "@workbridge/domain";
import type { EvidenceItem } from "../evidence";
import { sampleMatchDecision, sampleWorkflowEnvelope } from "../fixtures";
import { signBetterAuthSession } from "../roles";
import { ApplicationService } from "../service";

const NOW = "2026-10-16T18:00:00.000Z";
const SESSION_SECRET = "better-auth-test-secret";

function session(role: "candidate" | "employer" | "counselor", id: string = role) {
  return signBetterAuthSession(
    {
      session: { id: `sess-${id}`, userId: id, expiresAt: "2027-01-01T00:00:00.000Z" },
      user: {
        id,
        email: `${id}@workbridge.pa`,
        role,
        ...(role === "employer" ? { employerOrgId: "org-1" } : {}),
      },
    },
    SESSION_SECRET,
  );
}

function evidence(): EvidenceItem[] {
  return [
    {
      id: "ev-1",
      kind: "experience",
      text: "Apoyé el inventario. Contacto 6000-1234, cédula 8-123-456.",
      credentialStatus: "not_applicable",
    },
  ];
}

function match(): MatchDecision {
  return sampleMatchDecision({
    traceId: "trace-notify",
    decisionId: "dec-notify",
    total: 80,
    aptitude: "apt",
    strategy: "deterministic_greedy",
    transport: { feasible: true, source: "google_maps" },
    reason: "total registrado",
  });
}

function draftInput() {
  return {
    traceId: "trace-notify",
    idempotencyKey: "idem-draft-notify",
    candidateId: "candidate",
    vacancyId: "vac-1",
    vacancyTitle: "Auxiliar administrativo",
    employerOrgId: "org-1",
    candidateDisplayName: "Ana Pérez ana.perez@workbridge.pa",
    evidence: evidence(),
    match: match(),
    envelope: sampleWorkflowEnvelope("trace-notify", "idem-draft-notify"),
  };
}

function action(reason: string, idempotencyKey: string) {
  return {
    traceId: "trace-notify",
    idempotencyKey,
    reason,
    envelope: sampleWorkflowEnvelope("trace-notify", idempotencyKey),
  };
}

function service() {
  return new ApplicationService({
    clock: () => NOW,
    ids: (() => {
      let n = 0;
      return () => `id-${n++}`;
    })(),
    sessionSecret: SESSION_SECRET,
  });
}

describe("outbound notification outbox", () => {
  it("writes one employer notification and one submission audit event when a draft is submitted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const app = service();
    const created = app.createDraft(session("candidate"), draftInput());
    app.approveDraft(session("candidate"), created.draftId, action("confirmo el borrador", "idem-approve-notify"));
    const auditBefore = app.auditTrail(session("candidate"), "trace-notify");

    const submitted = await app.submit(session("candidate"), created.draftId, action("envío la postulación", "idem-submit-notify"));
    const replay = await app.submit(session("candidate"), created.draftId, action("envío la postulación", "idem-submit-notify"));
    const rows = await app.outboundNotifications(session("candidate"), "trace-notify");
    const auditAfter = app.auditTrail(session("candidate"), "trace-notify");

    expect(submitted.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(rows).toEqual([
      {
        recipientRole: "employer",
        channel: "in_app",
        timestamp: NOW,
        traceId: "trace-notify",
      },
    ]);
    expect(auditAfter.length - auditBefore.length).toBe(1);
    expect(auditAfter.filter((event) => event.action === "submission")).toHaveLength(1);
    const payload = JSON.stringify(rows);
    expect(payload).not.toContain("ana.perez@workbridge.pa");
    expect(payload).not.toContain("candidate@workbridge.pa");
    expect(payload).not.toContain("6000-1234");
    expect(payload).not.toContain("8-123-456");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
