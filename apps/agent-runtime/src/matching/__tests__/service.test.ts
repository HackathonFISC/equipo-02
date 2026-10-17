import { describe, expect, it } from "vitest";
import { MatchingInputError } from "../errors";
import { MatchingService } from "../service";
import { matchingConfigFromEnv } from "../config";
import {
  blockedDocument,
  candidateProfile,
  objectiveDocument,
  googleFetch,
  CANDIDATE_CONTEXT,
  VACANCY_CONTEXT,
  NOW,
  now,
} from "./helpers";

function offlineService(): MatchingService {
  const config = matchingConfigFromEnv({});
  return new MatchingService({ routing: config.routing, geocoding: config.geocoding });
}

describe("MatchingService.evaluatePair", () => {
  it("geocodes, calls the solver, and returns a validated decision", async () => {
    const profile = candidateProfile();
    const result = await offlineService().evaluatePair(
      profile,
      CANDIDATE_CONTEXT,
      { document: await objectiveDocument(), context: VACANCY_CONTEXT },
      { now },
    );

    expect(result.candidateId).toBe(profile.candidate_id);
    expect(result.vacancyId).toBe("vac-objective-001");
    expect(result.routing.source).toBe("local_matrix");
    expect(result.decidedAt).toBe(NOW);
    expect(["apt", "apt_with_gaps", "not_currently_apt"]).toContain(result.aptitude);

    // The canonical-skill-id bridge is what lets the mapped mandatory skills score.
    const technical = result.scoreBreakdown.find((item) => item.dimension === "technical");
    expect(technical?.rawScore).toBeGreaterThan(0);
    const mandatory = result.hardConstraints.find((item) => item.id === "mandatory_skills");
    expect(mandatory?.reason).not.toContain("Excel");
  });

  it("uses Google Maps when the key is configured", async () => {
    const config = matchingConfigFromEnv(
      { GOOGLE_MAPS_API_KEY: "test-key" },
      { fetchImpl: googleFetch() },
    );
    const service = new MatchingService({ routing: config.routing, geocoding: config.geocoding });
    const result = await service.evaluatePair(
      candidateProfile(),
      CANDIDATE_CONTEXT,
      { document: await objectiveDocument(), context: VACANCY_CONTEXT },
      { now },
    );
    expect(result.routing.source).toBe("google_maps");
  });
});

describe("MatchingService.nominateForCandidate", () => {
  it("runs the deterministic assignment across vacancies", async () => {
    const profile = candidateProfile();
    const result = await offlineService().nominateForCandidate({
      profile,
      context: CANDIDATE_CONTEXT,
      vacancies: [{ document: await objectiveDocument(), context: VACANCY_CONTEXT }],
      now,
    });

    expect(result.candidateId).toBe(profile.candidate_id);
    expect(result.home).toEqual({ lat: 8.9833, lng: -79.5167 });
    expect(result.result.decisions).toHaveLength(1);
    expect(result.skippedVacancyIds).toEqual([]);
  });

  it("skips blocked vacancies instead of scoring them", async () => {
    const service = offlineService();
    await expect(
      service.nominateForCandidate({
        profile: candidateProfile(),
        context: CANDIDATE_CONTEXT,
        vacancies: [{ document: await blockedDocument(), context: VACANCY_CONTEXT }],
        now,
      }),
    ).rejects.toBeInstanceOf(MatchingInputError);
  });
});
