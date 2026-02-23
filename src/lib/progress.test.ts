import { describe, test, expect } from 'bun:test';
import { createHmac } from 'crypto';
import { DEFAULT_PROGRESS } from '@/types';

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

describe('progress signing', () => {
  test('sign produces consistent output', () => {
    const data = JSON.stringify(DEFAULT_PROGRESS);
    const sig1 = sign(data, 'test-secret');
    const sig2 = sign(data, 'test-secret');
    expect(sig1).toBe(sig2);
  });

  test('different secrets produce different signatures', () => {
    const data = JSON.stringify(DEFAULT_PROGRESS);
    const sig1 = sign(data, 'secret-a');
    const sig2 = sign(data, 'secret-b');
    expect(sig1).not.toBe(sig2);
  });

  test('tampered data fails verification', () => {
    const data = JSON.stringify(DEFAULT_PROGRESS);
    const sig = sign(data, 'test-secret');
    const tampered = data.replace('"stars":0', '"stars":999');
    expect(sign(tampered, 'test-secret')).not.toBe(sig);
  });
});
