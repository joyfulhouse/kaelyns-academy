'use client';

import { useProgress } from '@/hooks/useProgress';

export default function StarDisplay() {
  const { progress } = useProgress();

  return (
    <div className="flex items-center gap-1.5 font-display text-xl text-chocolate font-bold">
      <span>{'\u2B50'}</span>
      <span>{progress.stars}</span>
    </div>
  );
}
