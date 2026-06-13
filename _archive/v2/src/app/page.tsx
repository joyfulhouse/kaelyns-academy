'use client';

import Link from 'next/link';
import StarDisplay from '@/components/StarDisplay';

export default function HomePage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-4 py-8">
      {/* Star display in top-right corner */}
      <div className="absolute top-4 right-4">
        <StarDisplay />
      </div>

      {/* Title area */}
      <div className="text-center mb-12 animate-fade-slide-in">
        <h1 className="font-display text-5xl text-chocolate font-bold mb-3 md:text-6xl">
          Kaelyn&apos;s Academy
        </h1>
        <p className="font-display text-xl text-chocolate-muted md:text-2xl">
          What do you want to learn?
        </p>
      </div>

      {/* Subject picker buttons */}
      <div className="flex flex-col gap-6 w-full max-w-lg sm:flex-row sm:gap-8">
        <Link
          href="/math"
          className="flex-1 flex flex-col items-center justify-center gap-2 bg-coral text-white rounded-2xl shadow-lifted py-10 text-3xl font-display font-bold transition-transform hover:scale-105 active:scale-95"
        >
          <span className="text-5xl">{'\uD83D\uDD22'}</span>
          <span>Math</span>
        </Link>

        <Link
          href="/reading"
          className="flex-1 flex flex-col items-center justify-center gap-2 bg-sage text-white rounded-2xl shadow-lifted py-10 text-3xl font-display font-bold transition-transform hover:scale-105 active:scale-95"
        >
          <span className="text-5xl">{'\uD83D\uDCD6'}</span>
          <span>Reading</span>
        </Link>
      </div>
    </main>
  );
}
