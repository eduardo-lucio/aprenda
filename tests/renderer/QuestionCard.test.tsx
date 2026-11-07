import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionCard } from '../../src/renderer/components/QuestionCard';

describe('QuestionCard (presentational, docked above the chat)', () => {
  const baseProps = {
    label: 'Pergunta 2',
    anchor: 'TTL',
    questionText: 'O que acontece quando o TTL atinge 0?',
    options: ['Descarta o pacote', 'Retransmite em loop', 'Converte em broadcast', 'Ignora o cabeçalho'],
    selectedIndex: null as number | null,
    onSelect: vi.fn(),
  };

  it('renders label, question, anchor and options without any text field of its own', () => {
    render(<QuestionCard {...baseProps} />);
    expect(screen.getByText('Pergunta 2')).toBeDefined();
    expect(screen.getByText('TTL')).toBeDefined();
    expect(screen.getByText('O que acontece quando o TTL atinge 0?')).toBeDefined();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/seu raciocínio/i)).toBeNull();
  });

  it('reports the selected option index and marks it as checked', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<QuestionCard {...baseProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Retransmite em loop'));
    expect(onSelect).toHaveBeenCalledWith(1);

    rerender(<QuestionCard {...baseProps} onSelect={onSelect} selectedIndex={1} />);
    expect(screen.getAllByRole('radio')[1].getAttribute('aria-checked')).toBe('true');
  });

  it('renders the dashed option and calls its handler', () => {
    const onDashed = vi.fn();
    render(
      <QuestionCard
        {...baseProps}
        dashedOption={{ label: 'Não sei / ainda não aprendi isso', selected: false, onSelect: onDashed, tone: 'amber' }}
      />
    );
    fireEvent.click(screen.getByText('Não sei / ainda não aprendi isso'));
    expect(onDashed).toHaveBeenCalled();
  });

  it('formats fenced code blocks with line numbers and inline code chips inside questionText and options', () => {
    render(
      <QuestionCard
        {...baseProps}
        questionText={'Considere este código:\n\n```js\nvar x = 10;\nlet y = 20;\n```\n\nQual é o resultado de `y`?'}
        options={[
          '`10` e `20`',
          '`10` e `ReferenceError: y is not defined`',
          '`undefined` e `undefined`',
          '`ReferenceError: x is not defined`',
        ]}
      />
    );

    const codeBlock = screen.getByTestId('code-block');
    expect(codeBlock).toBeDefined();
    expect(codeBlock.textContent).toContain('1');
    expect(codeBlock.textContent).toContain('2');
    expect(codeBlock.textContent).toContain('var x = 10;');
    expect(codeBlock.textContent).toContain('let y = 20;');

    const inlineChips = screen.getAllByTestId('inline-code');
    expect(inlineChips.length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('ReferenceError: y is not defined')).toBeDefined();
  });

  it('also formats unfenced code blocks that start with a language header line (e.g. js\\nconst a = 42;)', () => {
    render(
      <QuestionCard
        {...baseProps}
        questionText={'Considere o trecho abaixo executado no console do navegador:\n\njs\nconst a = 42;\nconst b = "42";\nconst c = a + b;\nconst d = a - b;\n\nApós a execução, quais são os valores e tipos de `c` e `d`?'}
        options={[
          '`c` é `"4242"` (string) e `d` é `0` (number)',
          '`c` é `84` (number) e `d` é `0` (number)',
          '`c` é `"4242"` (string) e `d` é `NaN` (number)',
          '`c` é `4242` (number) e `d` é `0` (number)',
        ]}
      />
    );

    const codeBlock = screen.getByTestId('code-block');
    expect(codeBlock).toBeDefined();
    expect(codeBlock.textContent).toContain('const a = 42;');
    expect(codeBlock.textContent).toContain('const d = a - b;');
  });
});
