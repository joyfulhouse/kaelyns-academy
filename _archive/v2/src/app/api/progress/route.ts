import { NextRequest, NextResponse } from 'next/server';
import type { Progress } from '@/types';
import { loadProgress, saveProgress } from '@/lib/progress';

export async function GET(): Promise<NextResponse> {
  try {
    const progress = await loadProgress();
    return NextResponse.json(progress);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load progress';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const progress: Progress = await request.json();
    await saveProgress(progress);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save progress';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
