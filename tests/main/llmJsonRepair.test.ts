// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseLLMJson, repairJson } from '../../src/main/services/llmClient';

describe('parseLLMJson reads the slips models make', () => {
  it('valid JSON is read as before', () => {
    const value = { nodes: [{ id: 'a', prerequisites: [] }], note: 'texto com "aspas" escapadas' };
    expect(parseLLMJson(JSON.stringify(value))).toEqual(value);
    expect(parseLLMJson('```json\n{"x": [1, 2]}\n```')).toEqual({ x: [1, 2] });
  });

  it('braces in the prose before the JSON (the "position 1" error) are skipped', () => {
    expect(parseLLMJson('Vou separar {camadas, portas} e depois:\n{"discipline": "Redes", "nodes": []}')).toEqual({
      discipline: 'Redes',
      nodes: [],
    });
  });

  it('text after the JSON, even with braces, is ignored', () => {
    expect(parseLLMJson('{"a": {"b": 1}}\n\nObservação: o conjunto {x} ficou de fora.')).toEqual({ a: { b: 1 } });
  });

  it('quotes the model forgot to escape stay in the text', () => {
    const raw =
      '{"questionText": "O que o "three-way handshake" garante?", ' +
      '"options": ["Usa o "SYN", na ida", "Nada", "Só o "ACK""], "correctOptionIndex": 0}';
    expect(parseLLMJson(raw)).toEqual({
      questionText: 'O que o "three-way handshake" garante?',
      options: ['Usa o "SYN", na ida', 'Nada', 'Só o "ACK"'],
      correctOptionIndex: 0,
    });
  });

  it('a missing comma between array elements or members (the "after array element" error)', () => {
    const raw = '{"nodes": [\n  {"id": "a", "level": 1}\n  {"id": "b", "level": 2}\n], "x": "1"\n "y": 2}';
    expect(parseLLMJson(raw)).toEqual({ nodes: [{ id: 'a', level: 1 }, { id: 'b', level: 2 }], x: '1', y: 2 });
  });

  it('line breaks inside strings, trailing commas and comments', () => {
    const raw = '{\n  // mapa\n  "summary": "linha 1\nlinha 2",\n  "list": [1, 2,],\n  /* fim */\n}';
    expect(parseLLMJson(raw)).toEqual({ summary: 'linha 1\nlinha 2', list: [1, 2] });
  });

  it('a LaTeX backslash that is not a JSON escape is kept as text', () => {
    expect(parseLLMJson('{"t": "$\\alpha + \\sqrt{2}$"}')).toEqual({ t: '$\\alpha + \\sqrt{2}$' });
  });

  it('JSON inside the reasoning used as the answer is still found', () => {
    expect(parseLLMJson('<think>a {b}</think>Pensando em {x}... resposta: {"x": 1}')).toEqual({ x: 1 });
  });

  it('a cut answer is not completed with guesses', () => {
    expect(() => parseLLMJson('{"nodes": [{"id": "a"}, {"id": "b", "title": "Tr')).toThrow(/JSON/);
    expect(repairJson('{"a": [1, 2', 0)).toBeNull();
  });

  it('an inner object of a broken answer is not taken for the answer', () => {
    expect(() => parseLLMJson('{ nodes: [{"id": "a", "title": "A"}] }')).toThrow();
  });

  it('prose without JSON still fails', () => {
    expect(() => parseLLMJson('Desculpe, não consigo ajudar com isso.')).toThrow(/JSON/);
  });
});
