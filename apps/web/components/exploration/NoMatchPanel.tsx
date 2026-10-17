import { EXCLUSION_LABELS, type ExplorationResult, type NoMatchCause } from '@puente/catalog';
import type { Roadmap } from '@puente/training';
import { NearMatchList } from './NearMatchList';
import { RoadmapList } from './RoadmapList';
import Link from 'next/link';

function CauseList({ causes }: { causes: NoMatchCause[] }) {
  if (causes.length === 0) return null;
  return (
    <ul className="warnings">
      {causes.map((cause) => (
        <li key={cause.reason}>
          {EXCLUSION_LABELS[cause.reason] ?? cause.reason}: {cause.count} vacante(s) — {cause.detail}
        </li>
      ))}
    </ul>
  );
}

export function NoMatchPanel({ result, roadmap }: { result: ExplorationResult; roadmap: Roadmap | null }) {
  if (result.matches.length > 0 || !result.noMatch) return null;
  return (
    <div role="alert" className="warning-panel">
      <h4>No encontramos una vacante viable</h4>
      <p>{result.noMatch.explanation}</p>
      <CauseList causes={result.noMatch.causes} />
      <NearMatchList nearMatches={result.noMatch.nearMatches} />
      {roadmap ? <RoadmapList roadmap={roadmap} gaps={roadmap.gaps} /> : null}
      {result.noMatch.roadmapRequested ? (
        <p className="no-match-route-link">
          <Link href="/ruta">Ver mi ruta de capacitación</Link>
        </p>
      ) : null}
    </div>
  );
}
