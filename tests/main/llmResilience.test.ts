// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { callLLM, cancelForegroundLLM, LLMCancelledError } from '../../src/main/services/llmClient';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

describe('callLLM deadlines and cancellation', () => {
  let server: http.Server;
  let baseURL: string;
  let handler: Handler;
  const open = new Set<http.ServerResponse>();

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      open.add(res);
      req.resume();
      req.on('end', () => handler(req, res));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const res of open) res.destroy();
    open.clear();
    await new Promise((r) => server.close(r));
  });

  const config = () => ({ baseURL, apiKey: 'k', model: 'm' });
  const sse = (res: http.ServerResponse) => res.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

  it('E1: gives up when the stream goes silent after the headers', async () => {
    handler = (_q, res) => {
      sse(res);
      res.write(chunk('{'));
    };
    await expect(callLLM({ prompt: 'x', config: config(), timeoutMs: 120 })).rejects.toThrow(/tempo limite|timed out/i);
  });

  it('E1: a slow stream that keeps sending data is not cut off', async () => {
    handler = (_q, res) => {
      sse(res);
      let n = 0;
      const t = setInterval(() => {
        res.write(chunk('a'));
        if (++n === 6) {
          clearInterval(t);
          res.end('data: [DONE]\n\n');
        }
      }, 40);
    };
    await expect(callLLM({ prompt: 'x', config: config(), timeoutMs: 120 })).resolves.toBe('aaaaaa');
  });

  it('E1: the student can cancel a call in the middle of the response', async () => {
    handler = (_q, res) => {
      sse(res);
      res.write(chunk('{'));
    };
    const pending = callLLM({ prompt: 'x', config: config(), timeoutMs: 5000 });
    await new Promise((r) => setTimeout(r, 60));
    cancelForegroundLLM();
    await expect(pending).rejects.toBeInstanceOf(LLMCancelledError);
  });

  it('E1: cancelling does not touch background calls', async () => {
    handler = (_q, res) => {
      sse(res);
      setTimeout(() => res.end(chunk('ok') + 'data: [DONE]\n\n'), 80);
    };
    const pending = callLLM({ prompt: 'x', config: config(), timeoutMs: 5000, isBackground: true });
    await new Promise((r) => setTimeout(r, 30));
    cancelForegroundLLM();
    await expect(pending).resolves.toBe('ok');
  });

  it('E1: the external abort signal also works in the middle of the response', async () => {
    handler = (_q, res) => {
      sse(res);
      res.write(chunk('{'));
    };
    const ctl = new AbortController();
    const pending = callLLM({ prompt: 'x', config: config(), timeoutMs: 5000, signal: ctl.signal, isBackground: true });
    await new Promise((r) => setTimeout(r, 60));
    ctl.abort();
    await expect(pending).rejects.toThrow(/cancelada/i);
  });

  it('E9: an error in the middle of the stream reports the real cause', async () => {
    handler = (_q, res) => {
      sse(res);
      res.write(chunk('{"parcial":'));
      res.end(`data: ${JSON.stringify({ error: { code: 503, message: 'sobrecarga' } })}\n\ndata: [DONE]\n\n`);
    };
    await expect(callLLM({ prompt: 'x', config: config(), timeoutMs: 1000 })).rejects.toThrow(/503.*sobrecarga/);
  });
});
