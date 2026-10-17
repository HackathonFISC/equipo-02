import Link from 'next/link';

export default function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <main><h1>Ingresa para guardar tu búsqueda</h1><p>Vincula tu cuenta para recibir nuevas coincidencias dentro de Puente Laboral.</p><Link href="/vacantes">Continuar a Vacantes</Link></main>;
}
