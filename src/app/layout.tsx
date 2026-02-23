import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import { ProgressProvider } from '@/hooks/useProgress';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka' });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' });

export const metadata: Metadata = {
  title: "Kaelyn's Academy",
  description: 'Learn math and reading with your AI tutor',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>
        <ProgressProvider>
          {children}
        </ProgressProvider>
      </body>
    </html>
  );
}
