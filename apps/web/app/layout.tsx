import type { Metadata } from 'next';
import { CandidateShell } from '../components/CandidateShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Puente Laboral Panamá — Intake de candidato',
  description: 'Captura de CV y experiencias para construir un perfil de candidato validado.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body><CandidateShell>{children}</CandidateShell></body>
    </html>
  );
}
