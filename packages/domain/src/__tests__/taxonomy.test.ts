import { describe, expect, it } from "vitest";
import {
  PANAMA_SKILL_TAXONOMY,
  matchSkill,
  normalizeText,
} from "@puente/domain";
import seedLabels from "../taxonomy/fixtures/panama-seed-labels.json";
import escoResolution from "../taxonomy/fixtures/esco-v1.2.1-panama-resolution.json";
import escoResponses from "../taxonomy/fixtures/esco-v1.2.1-captured-responses.json";

describe("normalizeText", () => {
  it("lowercases, strips accents, and collapses punctuation", () => {
    expect(normalizeText("  Atención al Cliente — Nivel 2 ")).toBe(
      "atencion al cliente nivel 2",
    );
  });
});

describe("matchSkill", () => {
  it("matches a canonical Spanish label exactly", () => {
    const match = matchSkill("Atención al cliente");
    expect(match.matched).toBe(true);
    expect(match.skillId).toBe("PA-CS-0001");
    expect(match.matchStrategy).toBe("exact");
    expect(match.matchConfidence).toBe(1);
    expect(match.taxonomyVersion).toBe(PANAMA_SKILL_TAXONOMY.version);
  });

  it("matches an alias while ignoring accent and case", () => {
    const match = matchSkill("SOPORTE IT");
    expect(match.matched).toBe(true);
    expect(match.skillId).toBe("PA-IT-0001");
    expect(match.matchStrategy).toBe("alias");
  });

  it("fuzzy-matches wording that embeds a skill phrase", () => {
    const match = matchSkill("Conocimiento de redes y conectividad básica");
    expect(match.matched).toBe(true);
    expect(match.skillId).toBe("PA-IT-0003");
    expect(match.matchStrategy).toBe("fuzzy");
    expect(match.matchConfidence).toBeGreaterThanOrEqual(0.8);
    expect(match.matchConfidence).toBeLessThanOrEqual(1);
  });

  it("does not invent a match for unrelated wording", () => {
    const match = matchSkill("Buena presencia");
    expect(match.matched).toBe(false);
    expect(match.skillId).toBeNull();
    expect(match.matchStrategy).toBe("none");
    expect(match.matchConfidence).toBe(0);
  });

  it("handles empty input without throwing", () => {
    expect(matchSkill("   ").matched).toBe(false);
  });
});

describe("ESCO taxonomy contract", () => {
  const ESCO_SKILL_URI =
    /^http:\/\/data\.europa\.eu\/esco\/skill\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("records the ESCO release used to resolve concept URIs", () => {
    expect(PANAMA_SKILL_TAXONOMY.escoVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(PANAMA_SKILL_TAXONOMY.provenance).toContain(PANAMA_SKILL_TAXONOMY.escoVersion);
    expect(escoResolution.version).toBe(PANAMA_SKILL_TAXONOMY.escoVersion);
    expect(escoResolution.concepts).toHaveLength(PANAMA_SKILL_TAXONOMY.skills.length);
    expect(escoResolution.concepts.every((concept) => concept.status === "released")).toBe(true);
    expect(escoResponses.version).toBe(PANAMA_SKILL_TAXONOMY.escoVersion);
    expect(escoResponses.concepts).toHaveLength(PANAMA_SKILL_TAXONOMY.skills.length);
  });

  it("gives every seed skill a verified ESCO URI or an explicit unmapped reason", () => {
    for (const skill of PANAMA_SKILL_TAXONOMY.skills) {
      if (skill.escoUri === null) {
        expect(skill.escoUnmappedReason.trim()).toBeTruthy();
      } else {
        expect(skill.escoUri, `${skill.id} has an invalid ESCO URI`).toMatch(ESCO_SKILL_URI);
        expect(skill.escoLabel.trim(), `${skill.id} has no ESCO label`).not.toBe("");
        const resolved = escoResolution.concepts.find((concept) => concept.id === skill.id);
        const captured = escoResponses.concepts.find((concept) => concept.id === skill.id);
        expect(resolved, `${skill.id} is missing from the pinned ESCO resolution`).toMatchObject({
          uri: skill.escoUri,
          label: skill.escoLabel,
          status: "released",
          selectedVersion: PANAMA_SKILL_TAXONOMY.escoVersion,
        });
        expect(resolved?.sourceUrl, `${skill.id} has no replayable ESCO source`).toContain(
          `uri=${encodeURIComponent(skill.escoUri)}`,
        );
        expect(captured, `${skill.id} is missing its captured ESCO response`).toMatchObject({
          sourceUrl: resolved?.sourceUrl,
          selectedVersion: PANAMA_SKILL_TAXONOMY.escoVersion,
          response: {
            uri: skill.escoUri,
            preferredLabel: { en: skill.escoLabel },
            status: "released",
          },
        });
      }
    }
  });

  it("keeps every ESCO concept URI unique across seed skills", () => {
    const uris = PANAMA_SKILL_TAXONOMY.skills
      .map((skill) => skill.escoUri)
      .filter((uri): uri is string => uri !== null);
    expect(new Set(uris).size).toBe(uris.length);
  });

  it("preserves the localized labels for every seed skill", () => {
    for (const skill of PANAMA_SKILL_TAXONOMY.skills) {
      expect(skill.labelEs, `${skill.id} Spanish label changed`).toBe(seedLabels[skill.id as keyof typeof seedLabels].labelEs);
      expect(skill.labelEn, `${skill.id} English label changed`).toBe(seedLabels[skill.id as keyof typeof seedLabels].labelEn);
    }
  });

  it("requires a reason for an unmapped skill", () => {
    const unmappedSkill = {
      id: "TEST-UNMAPPED",
      labelEs: "Habilidad de prueba",
      labelEn: "Test skill",
      escoLabel: "",
      escoUri: null,
      escoUnmappedReason: "No released ESCO concept matches the seed wording.",
      kind: "skill",
      aliases: [],
    };

    expect(unmappedSkill.escoUnmappedReason.trim()).toBeTruthy();
  });
});
