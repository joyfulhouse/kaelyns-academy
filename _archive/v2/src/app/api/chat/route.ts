import { NextRequest, NextResponse } from 'next/server';
import type { TutorRequest } from '@/types';
import { chatCompletion } from '@/lib/openrouter';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: TutorRequest = await request.json();
    const text = await chatCompletion(body);
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
