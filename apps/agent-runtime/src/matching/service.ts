import type { CandidateProfile, JobRequirements } from "@puente/domain";
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
import type { GeocodingPort } from "./geocode";

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
  result: NominationResult;
}

export interface EvaluatePairOptions {
  peers?: MatchOptions["peers"];
  approval?: HumanApprovalDecision;
  now?: () => Date;
}

export interface MatchingServiceDeps {
  routing: RoutingPort;
  geocoding: GeocodingPort;
}

export class MatchingService {
  constructor(private readonly deps: MatchingServiceDeps) {}

  /** Geocode the candidate's home location to the solver's `GeoPoint`. */
  async geocodeHome(context: CandidateMatchContext): Promise<GeoPoint> {
    return this.requireGeocode(this.deps.geocoding.geocode(context.home), "candidate home");
  }

  private async requireGeocode(
    resultPromise: Promise<Awaited<ReturnType<GeocodingPort["geocode"]>>>,
    subject: string,
  ): Promise<GeoPoint> {
    const result = await resultPromise;
    if (result.source === "default") {
      throw new MatchingInputError(`Unable to geocode ${subject}: no location matched.`);
    }
    return result.point;
  }

  private async vacancyInputs(
    vacancies: readonly VacancyMatchInput[],
  ): Promise<{ inputs: ReturnType<typeof toSolverVacancy>[]; skipped: string[] }> {
    const inputs = [];
    const skipped: string[] = [];
    for (const vacancy of vacancies) {
      if (!isVacancyRankable(vacancy.document)) {
        skipped.push(vacancy.document.vacancyId);
        continue;
      }
      const point = await this.requireGeocode(
        this.deps.geocoding.geocode(vacancy.document.location),
        `vacancy ${vacancy.document.vacancyId}`,
      );
      inputs.push(toSolverVacancy(vacancy.document, vacancy.context, point));
    }
    return { inputs, skipped };
  }

  /**
   * Score and assign one candidate across several vacancies. Scoring is
   * deterministic per pair; the assignment is the solver's capacity-constrained
   * MILP with the deterministic greedy fallback.
   */
  async nominateForCandidate(
    input: CandidateNominationInput,
  ): Promise<CandidateNominationResult> {
    const home = await this.geocodeHome(input.context);
    const candidate = toSolverCandidate(input.profile, input.context, home);
    const { inputs, skipped } = await this.vacancyInputs(input.vacancies);

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

    return { candidateId: candidate.candidateId, home, skippedVacancyIds: skipped, result };
  }

  /** Evaluate a single candidate/vacancy pair without solving an assignment. */
  async evaluatePair(
    profile: CandidateProfile,
    context: CandidateMatchContext,
    vacancy: VacancyMatchInput,
    options: EvaluatePairOptions = {},
  ): Promise<MatchDecision> {
    if (!isVacancyRankable(vacancy.document)) {
      throw new MatchingInputError(
        `Vacancy ${vacancy.document.vacancyId} is blocked and cannot be evaluated.`,
      );
    }
    const home = await this.geocodeHome(context);
    const candidate = toSolverCandidate(profile, context, home);
    const point = await this.requireGeocode(
      this.deps.geocoding.geocode(vacancy.document.location),
      `vacancy ${vacancy.document.vacancyId}`,
    );
    const solverVacancy = toSolverVacancy(vacancy.document, vacancy.context, point);

    return evaluateMatch(candidate, solverVacancy, {
      routing: this.deps.routing,
      ...(options.peers ? { peers: options.peers } : {}),
      ...(options.approval ? { approval: options.approval } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
  }
}

export function createMatchingService(deps: MatchingServiceDeps): MatchingService {
  return new MatchingService(deps);
}
