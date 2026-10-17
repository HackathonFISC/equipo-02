'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

function isBarePath(pathname: string) {
  if (pathname === '/' || pathname === '/chat') return true;
  return ['/ingresar', '/orientador', '/empresa'].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const navigation = [
  { href: '/vacantes', label: 'Vacantes' },
  { href: '/ruta', label: 'Mi ruta' },
  { href: '/postulaciones', label: 'Postulaciones' },
  { href: '/perfil', label: 'Mi perfil' },
];

export function CandidateShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [newCount, setNewCount] = useState(0);
  useEffect(() => {
    const candidateId = window.localStorage.getItem('puente:candidateId');
    if (!candidateId || pathname === '/vacantes') return;
    fetch(`/api/searches?candidateId=${encodeURIComponent(candidateId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((body: { searches?: Array<{ newSinceLastVisit?: unknown[] }> } | null) =>
        setNewCount(body?.searches?.reduce((count, search) => count + (search.newSinceLastVisit?.length ?? 0), 0) ?? 0))
      .catch(() => undefined);
  }, [pathname]);
  const isCandidateSurface = !isBarePath(pathname);

  if (!isCandidateSurface) return <>{children}</>;

  return (
    <div className="candidate-shell">
      <header className="candidate-header">
        <Link className="candidate-brand" href="/vacantes" aria-label="Puente Laboral, ir a Vacantes">
          <span className="candidate-brand-mark" aria-hidden="true">⌂</span>
          <span>Puente Laboral</span>
        </Link>
        <nav aria-label="Navegación principal">
          <ul className="candidate-nav candidate-nav-desktop">
            {navigation.map(({ href, label }) => (
              <li key={href}><NavLink href={href} label={label} badge={href === '/vacantes' ? newCount : 0} active={pathname === href || pathname.startsWith(`${href}/`)} /></li>
            ))}
          </ul>
        </nav>
      </header>
      <div className="candidate-content">{children}</div>
      <nav className="candidate-bottom-nav" aria-label="Navegación móvil">
        <ul className="candidate-nav">
          {navigation.map(({ href, label }) => (
            <li key={href}><NavLink href={href} label={label} badge={0} active={pathname === href || pathname.startsWith(`${href}/`)} /></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavLink({ href, label, badge, active }: { href: string; label: string; badge: number; active: boolean }) {
  return <Link href={href} className={`candidate-nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
    <span>{label}{badge > 0 ? <span className="nav-badge" aria-label={`${badge} vacantes nuevas`}>{badge}</span> : null}</span>
  </Link>;
}
