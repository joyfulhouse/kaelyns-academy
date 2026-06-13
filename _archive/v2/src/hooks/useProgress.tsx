'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { Progress, SkillProgress } from '@/types';
import { DEFAULT_PROGRESS } from '@/types';

interface ProgressContextType {
  progress: Progress;
  updateSkill: (subject: 'math' | 'reading', skill: string, updates: Partial<SkillProgress>) => void;
  addStar: () => void;
  loading: boolean;
}

const ProgressContext = createContext<ProgressContextType | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);

  // Load progress from API on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/progress');
        if (res.ok) {
          const data: Progress = await res.json();
          setProgress(data);
        }
      } catch {
        // Fall back to default progress on error
      } finally {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    }
    void load();
  }, []);

  // Auto-save progress on changes (debounced 500ms)
  useEffect(() => {
    if (isInitialLoadRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progress),
      });
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [progress]);

  const updateSkill = useCallback(
    (subject: 'math' | 'reading', skill: string, updates: Partial<SkillProgress>) => {
      setProgress((prev) => {
        const subjectData = prev[subject];
        if (!(skill in subjectData)) return prev;

        const currentSkill = subjectData[skill as keyof typeof subjectData] as SkillProgress;
        return {
          ...prev,
          [subject]: {
            ...subjectData,
            [skill]: { ...currentSkill, ...updates },
          },
          lastSession: new Date().toISOString(),
        };
      });
    },
    [],
  );

  const addStar = useCallback(() => {
    setProgress((prev) => ({
      ...prev,
      stars: prev.stars + 1,
    }));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream">
        <p className="font-display text-xl text-chocolate-muted animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <ProgressContext value={{ progress, updateSkill, addStar, loading }}>
      {children}
    </ProgressContext>
  );
}

export function useProgress(): ProgressContextType {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
}
