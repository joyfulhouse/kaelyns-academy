import { NextRequest, NextResponse } from 'next/server';
import { textToSpeech } from '@/lib/openrouter';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: { text: string } = await request.json();

    if (!body.text || body.text.length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (body.text.length > 500) {
      return NextResponse.json(
        { error: 'Text must be 500 characters or fewer' },
        { status: 400 },
      );
    }

    const audioBuffer = await textToSpeech(body.text);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TTS request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
