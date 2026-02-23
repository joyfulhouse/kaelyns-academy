import { cookies } from 'next/headers';
import { createHmac } from 'crypto';
import type { Progress } from '@/types';
import { DEFAULT_PROGRESS } from '@/types';

const COOKIE_NAME = 'ka-progress';
const SIG_COOKIE_NAME = 'ka-sig';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  return process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod';
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('hex');
}

function verify(data: string, signature: string): boolean {
  const expected = sign(data);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function loadProgress(): Promise<Progress> {
  const cookieStore = await cookies();
  const dataCookie = cookieStore.get(COOKIE_NAME);
  const sigCookie = cookieStore.get(SIG_COOKIE_NAME);

  if (!dataCookie?.value || !sigCookie?.value) {
    return { ...DEFAULT_PROGRESS };
  }

  const data = dataCookie.value;
  const signature = sigCookie.value;

  if (!verify(data, signature)) {
    return { ...DEFAULT_PROGRESS };
  }

  try {
    const parsed: unknown = JSON.parse(data);
    return parsed as Progress;
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export async function saveProgress(progress: Progress): Promise<void> {
  const cookieStore = await cookies();
  const data = JSON.stringify(progress);
  const signature = sign(data);

  const isProduction = process.env.NODE_ENV === 'production';

  const cookieOptions = {
    maxAge: MAX_AGE_SECONDS,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/',
  };

  cookieStore.set(COOKIE_NAME, data, cookieOptions);
  cookieStore.set(SIG_COOKIE_NAME, signature, cookieOptions);
}
