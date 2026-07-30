import type { GrillEngine, GrillRequest } from '../src/grill/client.js';

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

export function assertThrows(fn: () => unknown, substring: string): void {
  try {
    fn();
  } catch (err) {
    const message = (err as Error).message;
    if (!message.includes(substring)) {
      throw new Error(`ASSERT FAILED: expected error containing "${substring}", got: ${message}`);
    }
    return;
  }
  throw new Error(`ASSERT FAILED: expected an error containing "${substring}", none was thrown`);
}

export async function assertThrowsAsync(fn: () => Promise<unknown>, substring: string): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = (err as Error).message;
    if (!message.includes(substring)) {
      throw new Error(`ASSERT FAILED: expected error containing "${substring}", got: ${message}`);
    }
    return;
  }
  throw new Error(`ASSERT FAILED: expected an error containing "${substring}", none was thrown`);
}

/**
 * Replays canned responses in call order. Keeps the deterministic half of the
 * pipeline testable with no API key and no network.
 */
export class FakeGrill implements GrillEngine {
  readonly model = 'fake-model';
  readonly effort = 'test';
  readonly requests: GrillRequest[] = [];
  private queue: unknown[];

  constructor(responses: unknown[]) {
    this.queue = [...responses];
  }

  async run<T>(request: GrillRequest): Promise<T> {
    this.requests.push(request);
    if (this.queue.length === 0) {
      throw new Error('FakeGrill: no response queued for this call');
    }
    return this.queue.shift() as T;
  }
}
