import Link from 'next/link';

export default function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <SignInContent searchParams={searchParams} />;
}

async function SignInContent({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = '/vacantes' } = await searchParams;
  const destination = next.startsWith('/') ? next : '/vacantes';
  return <main><h1>Ingresa para guardar tu búsqueda</h1><p>Vincula tu cuenta para recibir nuevas coincidencias dentro de Puente Laboral.</p><Link href={destination}>Continuar</Link></main>;
}
