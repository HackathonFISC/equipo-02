import {
  assertCandidateProfile,
  assertJobRequirements,
  type CandidateProfile,
  type JobRequirements,
} from "@puente/domain";
import {
  evaluateMatch,
  nominate,
  type GeoPoint,
  type HumanApprovalDecision,
  type MatchDecision,
  type MatchOptions,
  type NominationResult,
  type RoutingPort,
} from "@puente/solver";
import { isVacancyRankable } from "../vacancy/ranking";
import {
  toSolverCandidate,
  toSolverVacancy,
  type CandidateMatchContext,
  type VacancyMatchContext,
} from "./adapt";
import { MatchingInputError } from "./errors";
import type { GeocodeResult, GeocodingPort } from "./geocode";

/**
 * The runtime → solver seam (issue #20).
 *
 * `MatchingService` is the one place `apps/agent-runtime` calls
 * `@puente/solver`: it geocodes the candidate's home and each vacancy location
 * to `GeoPoint`, projects the domain documents onto the solver's contracts, and
 * runs the deterministic matcher (`nominate`) or a single pair (`evaluateMatch`).
 * Blocked vacancies are skipped rather than scored.
 */

export interface VacancyMatchInput {
  document: JobRequirements;
  context: VacancyMatchContext;
}

export interface CandidateNominationInput {
  profile: CandidateProfile;
  context: CandidateMatchContext;
  vacancies: readonly VacancyMatchInput[];
  approvals?: readonly HumanApprovalDecision[];
  now?: () => Date;
}

export interface CandidateNominationResult {
  candidateId: string;
  /** Geocoded home used for routing and reasons. */
  home: GeoPoint;
  /** Vacancy ids skipped because the vacancy is blocked. */
  skippedVacancyIds: string[];
  geocoding: {
    home: GeocodeResult;
    vacancies: Record<string, GeocodeResult>;
  };
  warnings: string[];
  result: NominationResult;
}

export interface EvaluatedPairResult {
  decision: MatchDecision;
  geocoding: { home: GeocodeResult; vacancy: GeocodeResult };
  warnings: string[];
}

export interface EvaluatePairOptions {
  peers?: MatchOptions["peers"];
  approval?: HumanApprovalDecision;
  now?: () => Date;
}

export interface MatchingServiceDeps {
  routing: RoutingPort;
  geocoding: GeocodingPort;
  /** Runtime/provider warnings that must remain visible to callers. */
  warnings?: readonly string[];
}

export class MatchingService {
  constructor(private readonly deps: MatchingServiceDeps) {}

  /** Geocode the candidate's home location to the solver's `GeoPoint`. */
  async geocodeHome(context: CandidateMatchContext): Promise<GeoPoint> {
    return (await this.requireGeocode(this.deps.geocoding.geocode(context.home), "candidate home")).point;
  }

  private async requireGeocode(
    resultPromise: Promise<Awaited<ReturnType<GeocodingPort["geocode"]>>>,
    subject: string,
  ): Promise<GeocodeResult> {
    const result = await resultPromise;
    if (result.source === "default") {
      throw new MatchingInputError(`Unable to geocode ${subject}: no location matched.`);
    }
    return result;
  }

  private assertFresh(vacancy: VacancyMatchInput, now: Date): void {
    const capturedAt = Date.parse(vacancy.document.capturedAt);
    if (!Number.isFinite(capturedAt)) {
      throw new MatchingInputError(`Vacancy ${vacancy.document.vacancyId} has invalid freshness metadata.`);
    }
    const maxAgeHours = 72;
    if (now.getTime() - capturedAt > maxAgeHours * 60 * 60 * 1000) {
      throw new MatchingInputError(
        `Vacancy ${vacancy.document.vacancyId} is stale: older than ${maxAgeHours} hours.`,
      );
    }
  }

  private validateDocuments(profile: unknown, vacancies: readonly VacancyMatchInput[]): void {
    try {
      assertCandidateProfile(profile);
      for (const vacancy of vacancies) assertJobRequirements(vacancy.document);
    } catch (error) {
      throw new MatchingInputError(
        `Matching input failed runtime validation: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private freshnessWarning(vacancy: VacancyMatchInput, now: Date): string | null {
    const ageHours = (now.getTime() - Date.parse(vacancy.document.capturedAt)) / (60 * 60 * 1000);
    const maxAgeHours = 72;
    return ageHours >= maxAgeHours - 24 && ageHours <= maxAgeHours
      ? `Vacancy ${vacancy.document.vacancyId} is approaching its ${maxAgeHours}-hour freshness limit.`
      : null;
  }

  private async vacancyInputs(
    vacancies: readonly VacancyMatchInput[],
    now: Date,
  ): Promise<{
    inputs: ReturnType<typeof toSolverVacancy>[];
    skipped: string[];
    geocoding: Record<string, GeocodeResult>;
    warnings: string[];
  }> {
    const inputs = [];
    const skipped: string[] = [];
    const geocoding: Record<string, GeocodeResult> = {};
    const warnings: string[] = [];
    for (const vacancy of vacancies) {
      if (!isVacancyRankable(vacancy.document)) {
        skipped.push(vacancy.document.vacancyId);
        continue;
      }
      this.assertFresh(vacancy, now);
      const freshnessWarning = this.freshnessWarning(vacancy, now);
      if (freshnessWarning) warnings.push(freshnessWarning);
      const geocode = await this.requireGeocode(
        this.deps.geocoding.geocode(vacancy.document.location),
        `vacancy ${vacancy.document.vacancyId}`,
      );
      geocoding[vacancy.document.vacancyId] = geocode;
      if (geocode.fallbackReason) warnings.push(geocode.fallbackReason);
      inputs.push(toSolverVacancy(vacancy.document, vacancy.context, geocode.point));
    }
    return { inputs, skipped, geocoding, warnings };
  }

  /**
   * Score and assign one candidate across several vacancies. Scoring is
   * deterministic per pair; the assignment is the solver's capacity-constrained
   * MILP with the deterministic greedy fallback.
   */
  async nominateForCandidate(
    input: CandidateNominationInput,
  ): Promise<CandidateNominationResult> {
    this.validateDocuments(input.profile, input.vacancies);
    const homeResult = await this.requireGeocode(
      this.deps.geocoding.geocode(input.context.home),
      "candidate home",
    );
    const candidate = toSolverCandidate(input.profile, input.context, homeResult.point);
    const { inputs, skipped, geocoding, warnings } = await this.vacancyInputs(
      input.vacancies,
      input.now?.() ?? new Date(),
    );
    warnings.unshift(
      ...(this.deps.warnings ?? []),
      ...(homeResult.fallbackReason ? [homeResult.fallbackReason] : []),
    );

    if (inputs.length === 0) {
      throw new MatchingInputError(
        "No rankable vacancy was supplied: every vacancy is blocked or the list is empty.",
      );
    }

    const result = await nominate({
      candidates: [candidate],
      vacancies: inputs,
      routing: this.deps.routing,
      ...(input.approvals ? { approvals: input.approvals } : {}),
      ...(input.now ? { now: input.now } : {}),
    });

    return {
      candidateId: candidate.candidateId,
      home: homeResult.point,
      skippedVacancyIds: skipped,
      geocoding: { home: homeResult, vacancies: geocoding },
      warnings,
      result,
    };
  }

  /** Evaluate a single candidate/vacancy pair without solving an assignment. */
  async evaluatePair(
    profile: CandidateProfile,
    context: CandidateMatchContext,
    vacancy: VacancyMatchInput,
    options: EvaluatePairOptions = {},
  ): Promise<MatchDecision> {
    const result = await this.evaluatePairWithMetadata(profile, context, vacancy, options);
    return result.warnings.length > 0
      ? {
          ...result.decision,
          reasons: [
            ...result.decision.reasons,
            ...result.warnings.map((warning) => `Freshness/geocoding warning: ${warning}`),
          ],
        }
      : result.decision;
  }

  async evaluatePairWithMetadata(
    profile: CandidateProfile,
    context: CandidateMatchContext,
    vacancy: VacancyMatchInput,
    options: EvaluatePairOptions = {},
  ): Promise<EvaluatedPairResult> {
    this.validateDocuments(profile, [vacancy]);
    if (!isVacancyRankable(vacancy.document)) {
      throw new MatchingInputError(
        `Vacancy ${vacancy.document.vacancyId} is blocked and cannot be evaluated.`,
      );
    }
    const now = options.now?.() ?? new Date();
    this.assertFresh(vacancy, now);
    const homeResult = await this.requireGeocode(
      this.deps.geocoding.geocode(context.home),
      "candidate home",
    );
    const candidate = toSolverCandidate(profile, context, homeResult.point);
    const vacancyResult = await this.requireGeocode(
      this.deps.geocoding.geocode(vacancy.document.location),
      `vacancy ${vacancy.document.vacancyId}`,
    );
    const solverVacancy = toSolverVacancy(vacancy.document, vacancy.context, vacancyResult.point);
    const freshnessWarning = this.freshnessWarning(vacancy, now);

    return {
      decision: await evaluateMatch(candidate, solverVacancy, {
      routing: this.deps.routing,
      ...(options.peers ? { peers: options.peers } : {}),
      ...(options.approval ? { approval: options.approval } : {}),
      ...(options.now ? { now: options.now } : {}),
      }),
      geocoding: { home: homeResult, vacancy: vacancyResult },
      warnings: [
        ...(this.deps.warnings ?? []),
        ...(homeResult.fallbackReason ? [homeResult.fallbackReason] : []),
        ...(freshnessWarning ? [freshnessWarning] : []),
        ...(vacancyResult.fallbackReason ? [vacancyResult.fallbackReason] : []),
      ],
    };
  }
}

export function createMatchingService(deps: MatchingServiceDeps): MatchingService {
  return new MatchingService(deps);
}
