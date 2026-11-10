import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { parseSegments, splitLooseCode, RichText } from '../../src/renderer/components/RichText';

describe('code a model wrote without a fence', () => {
  it('a Python function in the middle of a sentence becomes a block, indentation kept', () => {
    const text = 'Considere o código:\ndef fatorial(n):\n    if n == 0:\n        return 1\n    return n * fatorial(n - 1)\nO que fatorial(3) devolve?';
    const segs = parseSegments(text);
    expect(segs.map((s) => s.type)).toEqual(['text', 'code', 'text']);
    expect(segs[1]).toEqual({
      type: 'code', lang: 'python',
      value: 'def fatorial(n):\n    if n == 0:\n        return 1\n    return n * fatorial(n - 1)',
    });
    expect(segs[2]).toEqual({ type: 'text', value: 'O que fatorial(3) devolve?' });
  });

  it('JavaScript statements', () => {
    const segs = splitLooseCode('Veja:\nconst a = [1, 2];\na.push(3);\nconsole.log(a.length);\nQuanto aparece?');
    expect(segs[1]).toMatchObject({ type: 'code', lang: 'javascript' });
    expect((segs[1] as any).value.split('\n')).toHaveLength(3);
  });

  it('prose is left alone, even with an assignment or a colon', () => {
    for (const text of [
      'Se x = 5, então o laço roda cinco vezes.\nIsso acontece porque a condição é avaliada antes.',
      'Pense assim:\nprimeiro o caso base, depois o passo recursivo.',
      'Para cada item da lista: some 1.\nDepois divida pelo total.',
      '- uma função chama outra\n- a pilha cresce',
      'Use `x = 1` e depois `y = 2`.\nCompare os dois.',
    ]) {
      expect(splitLooseCode(text)).toEqual([{ type: 'text', value: text }]);
    }
  });

  it('a single code-like line stays in the text', () => {
    expect(splitLooseCode('Escreva return n e veja.')).toEqual([{ type: 'text', value: 'Escreva return n e veja.' }]);
  });

  it('fenced code is not touched', () => {
    const segs = parseSegments('```python\ndef f():\n    return 1\n```');
    expect(segs).toEqual([{ type: 'code', lang: 'python', value: 'def f():\n    return 1' }]);
  });

  it('the screen shows the block as code', () => {
    const { container } = render(<RichText text={'Código:\ndef f(x):\n    return x * 2\nE agora?'} />);
    expect(container.querySelector('[data-testid="code-block"]')?.textContent).toContain('    return x * 2');
  });
});
