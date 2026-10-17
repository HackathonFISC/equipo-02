'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

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
              <li key={href}><NavLink href={href} label={label} active={pathname === href || pathname.startsWith(`${href}/`)} /></li>
            ))}
          </ul>
        </nav>
      </header>
      <div className="candidate-content">{children}</div>
      <nav className="candidate-bottom-nav" aria-label="Navegación móvil">
        <ul className="candidate-nav">
          {navigation.map(({ href, label }) => (
            <li key={href}><NavLink href={href} label={label} active={pathname === href || pathname.startsWith(`${href}/`)} /></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return <Link href={href} className={`candidate-nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
    <span>{label}</span>
  </Link>;
}
