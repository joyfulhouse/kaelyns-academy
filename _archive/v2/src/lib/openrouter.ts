import type { TutorRequest, MathProblem } from '@/types';
import { TUTOR_SYSTEM_PROMPT } from './tutorPrompt';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }
  return key;
}

function buildUserMessage(req: TutorRequest): string {
  switch (req.action) {
    case 'greet':
      return 'Kaelyn just started a new learning session. Give her a warm, fun greeting and ask what she wants to work on today.';

    case 'correct': {
      const problem = req.problem?.display ?? 'a problem';
      const answer = req.studentAnswer ?? '?';
      if (req.wasCorrect) {
        const streak = req.recentStreak ?? 0;
        return `Kaelyn answered "${problem}" with "${answer}" and got it RIGHT! She has ${streak} correct in a row. Praise her!`;
      }
      return `Kaelyn answered "${problem}" with "${answer}" but the correct answer was "${req.problem?.answer ?? '?'}". Gently encourage her to try again.`;
    }

    case 'scaffold': {
      const problem = req.problem?.display ?? 'a problem';
      const mathProblem = req.problem as MathProblem | undefined;
      const steps = mathProblem?.scaffoldSteps;
      if (steps && steps.length > 0) {
        return `Kaelyn is stuck on "${problem}". Walk her through the first small step. Available steps: ${steps.join(', ')}. Ask ONE question to guide her.`;
      }
      return `Kaelyn is stuck on "${problem}". Break it into a tiny first step and ask her ONE guiding question.`;
    }

    case 'summarize': {
      const stats = req.sessionStats ?? { correct: 0, total: 0 };
      return `Kaelyn finished a session: ${stats.correct} correct out of ${stats.total} total. Give a short, upbeat summary and encourage her to come back.`;
    }

    case 'hint': {
      const problem = req.problem?.display ?? 'a problem';
      return `Kaelyn needs a hint for "${problem}". Give ONE small hint without revealing the answer.`;
    }

    case 'chat':
      return req.userMessage ?? 'Kaelyn said something but we missed it. Ask her to say it again.';
  }
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
    code: number;
  };
}

export async function chatCompletion(req: TutorRequest): Promise<string> {
  const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4';
  const apiKey = getApiKey();

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://kaelyns.academy',
      'X-Title': "Kaelyn's Academy",
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      temperature: 0.8,
      messages: [
        { role: 'system', content: TUTOR_SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(req) },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenRouter chat request failed (${response.status}): ${body}`
    );
  }

  const data: ChatCompletionResponse = await response.json();

  if (data.error) {
    throw new Error(
      `OpenRouter API error (${data.error.code}): ${data.error.message}`
    );
  }

  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter returned an empty response');
  }

  return content;
}

export async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const model = process.env.TTS_MODEL ?? 'tts-1';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice: 'nova',
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenAI TTS request failed (${response.status}): ${body}`
    );
  }

  return response.arrayBuffer();
}
