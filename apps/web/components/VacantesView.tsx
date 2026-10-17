'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ExplorationResult, VacancyMatch } from '@puente/catalog';
import { MODALITY_LABELS } from '@puente/catalog';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Skeleton } from './ui/skeleton';
import type { Roadmap } from '@puente/training';
import { NoMatchPanel } from './exploration/NoMatchPanel';
import { readExplorationSession } from '../lib/exploration-session';
import { saveExplorationSession } from '../lib/exploration-session';
import type { PreferencesDraft } from '../lib/preferences';
import { useExploreVacancies } from '../lib/queries/exploration';
import { useRequestRoadmap } from '../lib/queries/roadmap';

export interface VacantesViewProps {
  result?: ExplorationResult | null;
  loading?: boolean;
}

const money = (min: number | null, max: number | null) => {
  if (min === null && max === null) return 'Salario no publicado';
  if (min === null) return `Hasta USD ${max}`;
  if (max === null) return `Desde USD ${min}`;
  return `USD ${min} – ${max}`;
};

const PREFERENCE_METADATA = new Set(['schema_version', 'preferences_id', 'origin', 'created_at', 'updated_at']);

function toPreferencesDraft(preferences: ExplorationResult['preferences']): PreferencesDraft {
  return Object.fromEntries(Object.entries(preferences).filter(([key]) => !PREFERENCE_METADATA.has(key))) as PreferencesDraft;
}

export function VacantesView({ result = null, loading = false }: VacantesViewProps) {
  const [sessionResult, setSessionResult] = useState<ExplorationResult | null>(result);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const exploreMutation = useExploreVacancies();
  const roadmapMutation = useRequestRoadmap();
  useEffect(() => {
    const session = readExplorationSession();
    if (session) {
      setSessionResult(session.result);
      setRoadmap(session.roadmap);
    }
  }, []);

  const displayedResult = result ?? sessionResult;
  const matches = displayedResult?.matches ?? [];
  const selected = matches.find((match) => match.vacancy.jobId === selectedId) ?? null;

  async function enableTrainingAndRebuild() {
    if (!displayedResult) return;
    const nextPreferences: PreferencesDraft = { ...toPreferencesDraft(displayedResult.preferences), willing_to_train: true };

    try {
      const explored = await exploreMutation.mutateAsync(nextPreferences);
      let generatedRoadmap: Roadmap | null = null;
      if (explored.noMatch?.roadmapRequested) {
        try {
          generatedRoadmap = (await roadmapMutation.mutateAsync(explored)).roadmap;
        } catch {
          // The roadmap is advisory; the refreshed no-match explanation remains useful.
        }
      }
      setSessionResult(explored);
      setRoadmap(generatedRoadmap);
      saveExplorationSession(explored, generatedRoadmap);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo actualizar la exploración');
    }
  }

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('v');
    if (fromUrl) setSelectedId(fromUrl);
    const onPopState = () => setSelectedId(new URLSearchParams(window.location.search).get('v'));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!selectedId || selected) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('v')) {
      url.searchParams.delete('v');
      window.history.replaceState({}, '', url);
      setSelectedId(null);
      setNotice('Esa vacante ya no está disponible');
      window.setTimeout(() => setNotice(null), 5000);
    }
  }, [selectedId, selected]);

  function open(match: VacancyMatch) {
    setSelectedId(match.vacancy.jobId);
    const url = new URL(window.location.href);
    url.searchParams.set('v', match.vacancy.jobId);
    window.history.pushState({}, '', url);
  }

  function close() {
    const previous = selectedId;
    const url = new URL(window.location.href);
    url.searchParams.delete('v');
    window.history.pushState({}, '', url);
    setSelectedId(null);
    if (previous) requestAnimationFrame(() => cardRefs.current.get(previous)?.focus());
  }

  return <main className="vacantes-page">
    {notice ? <div className="toast-notice" role="status">{notice}</div> : null}
    <div className="vacantes-heading">
      <div><p className="eyebrow">Explora oportunidades</p><h1>Vacantes para ti</h1><p className="lead">Encontramos oportunidades que se ajustan a lo que buscas.</p></div>
       <span className="vacantes-count">{displayedResult?.summary.matched ?? 0} compatibles</span>
    </div>
    {loading ? <div className="vacancy-grid" aria-label="Cargando vacantes">{[1, 2, 3].map((id) => <Skeleton key={id} className="vacancy-skeleton" />)}</div> : <>
      {matches.length ? <div className="vacancy-grid" aria-label="Vacantes compatibles">{matches.map((match) => <VacancyCard key={match.vacancy.jobId} match={match} onOpen={open} ref={(node) => { if (node) cardRefs.current.set(match.vacancy.jobId, node); }} />)}</div> : <div className="vacantes-empty" role="status"><h2>Aún no hay vacantes compatibles</h2><p>Completa tus preferencias para descubrir oportunidades hechas para ti.</p></div>}
        {displayedResult?.noMatch ? (
          <NoMatchPanel result={displayedResult} roadmap={roadmap} onEnableTraining={enableTrainingAndRebuild} />
        ) : null}
       {displayedResult?.excluded.length ? <p className="excluded-summary"><strong>{displayedResult.excluded.length} vacantes excluidas</strong> · {topCauses(displayedResult.excluded)}</p> : null}
    </>}
    <VacancyDetail match={selected} open={Boolean(selected)} onClose={close} />
  </main>;
}

const VacancyCard = forwardRef<HTMLButtonElement, { match: VacancyMatch; onOpen: (match: VacancyMatch) => void }>(function VacancyCard({ match, onOpen }, ref) {
  const { vacancy, freshness } = match;
  return <button ref={ref} className="vacancy-card" onClick={() => onOpen(match)} aria-label={`Ver detalles de ${vacancy.title}`}>
    <span className="vacancy-card-top"><span className="vacancy-modality">{MODALITY_LABELS[vacancy.modality]}</span><span>{freshness.label}</span></span>
    <strong className="vacancy-title">{vacancy.title}</strong><span className="vacancy-company">{vacancy.company ?? 'Empresa no indicada'}</span>
    <span className="vacancy-meta">{vacancy.location.raw ?? vacancy.location.district ?? 'Ubicación no indicada'} · {money(vacancy.salary.minUsd, vacancy.salary.maxUsd)}</span>
    <span className="vacancy-card-action">Ver detalles <span aria-hidden="true">→</span></span>
  </button>;
});
VacancyCard.displayName = 'VacancyCard';

function topCauses(excluded: NonNullable<ExplorationResult['excluded']>) { return excluded.flatMap((item) => item.failedConstraints.map((cause) => cause.detail)).slice(0, 3).join(' · '); }

function VacancyDetail({ match, open, onClose }: { match: VacancyMatch | null; open: boolean; onClose: () => void }) {
  if (!match) return null;
  const { vacancy, freshness } = match;
  return <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}><SheetContent side="right" className="vacancy-detail"><SheetHeader><SheetTitle>{vacancy.title}</SheetTitle><SheetDescription>{vacancy.company ?? 'Empresa no indicada'} · {freshness.label}</SheetDescription></SheetHeader><div className="vacancy-detail-body"><p><strong>Modalidad</strong><br />{MODALITY_LABELS[vacancy.modality]}</p><p><strong>Ubicación</strong><br />{vacancy.location.raw ?? vacancy.location.district ?? 'No indicada'}</p><p><strong>Salario</strong><br />{money(vacancy.salary.minUsd, vacancy.salary.maxUsd)}</p><p><strong>Por qué coincide</strong></p><ul>{match.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><Button asChild size="lg" className="vacancy-original"><a href={vacancy.provenance.sourceUrl} target="_blank" rel="noreferrer">Ver vacante original <span className="sr-only">(se abre en otra pestaña)</span> ↗</a></Button></SheetContent></Sheet>;
}
