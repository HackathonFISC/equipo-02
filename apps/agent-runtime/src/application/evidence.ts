import { ApplicationError } from "./errors";

export const EVIDENCE_KINDS = ["experience", "skill", "education", "certification"] as const;
export const CREDENTIAL_STATUSES = ["verified", "unverified", "not_applicable"] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const PROFILE_CREDENTIAL_STATUSES = [
  "declared",
  "verified",
  "partially_verified",
  "unverified",
  "rejected",
] as const;

export type ProfileCredentialStatus = (typeof PROFILE_CREDENTIAL_STATUSES)[number];

export interface ProfileEvidenceItem {
  id: string;
  kind: EvidenceItem["kind"];
  text: string;
  credentialStatus: ProfileCredentialStatus;
}

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  text: string;
  credentialStatus: CredentialStatus;
}

const KINDS = new Set<string>(EVIDENCE_KINDS);
const STATUSES = new Set<string>(CREDENTIAL_STATUSES);

export function parseEvidence(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) {
    throw new ApplicationError("evidence must be an array.", 422, "invalid_input");
  }
  const seen = new Set<string>();
  return value.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new ApplicationError("evidence item is invalid.", 422, "invalid_input");
    }
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id.trim() === "") {
      throw new ApplicationError("evidence id is required.", 422, "invalid_input");
    }
    if (seen.has(row.id)) {
      throw new ApplicationError(`Duplicate evidence "${row.id}".`, 422, "invalid_input");
    }
    seen.add(row.id);
    if (typeof row.text !== "string" || row.text.trim() === "") {
      throw new ApplicationError("evidence text is required.", 422, "invalid_input");
    }
    if (typeof row.kind !== "string" || !KINDS.has(row.kind)) {
      throw new ApplicationError("evidence kind is invalid.", 422, "invalid_input");
    }
    if (typeof row.credentialStatus !== "string" || !STATUSES.has(row.credentialStatus)) {
      throw new ApplicationError("credential status is invalid.", 422, "invalid_input");
    }
    return {
      id: row.id,
      text: row.text,
      kind: row.kind as EvidenceKind,
      credentialStatus: row.credentialStatus as CredentialStatus,
    };
  });
}

/**
 * Map a candidate's profile evidence to application EvidenceItem.
 *
 * Certification evidence keeps its verified status only when already verified;
 * declared, partially_verified, unverified, and rejected certifications are
 * treated as unverified for application purposes. Non-certification evidence
 * (experience, skill, education) maps to not_applicable regardless of input
 * status, since it is not a verifiable credential.
 */
export function toApplicationEvidence(
  profileEvidence: readonly ProfileEvidenceItem[],
): EvidenceItem[] {
  return profileEvidence.map((item) => {
    const credentialStatus: CredentialStatus =
      item.kind === "certification"
        ? item.credentialStatus === "verified"
          ? "verified"
          : "unverified"
        : "not_applicable";
    return {
      id: item.id,
      kind: item.kind,
      text: item.text,
      credentialStatus,
    };
  });
}
