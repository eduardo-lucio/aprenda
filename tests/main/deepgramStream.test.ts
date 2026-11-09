import { describe, it, expect, vi } from 'vitest';
import { openDeepgramStream } from '../../src/main/services/speechService';

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket;
  readyState = 0;
  sent: unknown[] = [];
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;
  constructor(public url: string, public protocols: string[]) {
    FakeSocket.last = this;
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  result(transcript: string, is_final: boolean) {
    this.onmessage?.({ data: JSON.stringify({ type: 'Results', is_final, channel: { alternatives: [{ transcript }] } }) });
  }
}

const start = () => {
  const handlers = { onTranscript: vi.fn(), onError: vi.fn(), onClose: vi.fn() };
  const stream = openDeepgramStream({ apiKey: 'k', language: 'pt-BR', ...handlers }, FakeSocket as unknown as typeof WebSocket);
  return { stream, handlers, ws: FakeSocket.last };
};

describe('openDeepgramStream', () => {
  it('asks for interim results and authenticates through the subprotocol', () => {
    const { ws } = start();
    expect(ws.url).toContain('interim_results=true');
    expect(ws.protocols).toEqual(['token', 'k']);
  });

  it('holds audio until the socket opens, in order', () => {
    const { stream, ws } = start();
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    stream.send(a);
    stream.send(b);
    expect(ws.sent).toEqual([]);
    ws.open();
    expect(ws.sent).toEqual([a, b]);
  });

  it('reports interim and final words', () => {
    const { handlers, ws } = start();
    ws.result('ola', false);
    ws.result('ola mundo', true);
    expect(handlers.onTranscript.mock.calls).toEqual([['ola', false], ['ola mundo', true]]);
  });

  it('finish flushes and resolves when the server closes', async () => {
    const { stream, ws, handlers } = start();
    ws.open();
    const done = stream.finish();
    expect(ws.sent).toEqual([JSON.stringify({ type: 'CloseStream' })]);
    ws.close();
    await done;
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('refuses to start without a key', () => {
    expect(() => openDeepgramStream({ apiKey: ' ', onTranscript: vi.fn(), onError: vi.fn(), onClose: vi.fn() })).toThrow(/Deepgram/);
  });
});
