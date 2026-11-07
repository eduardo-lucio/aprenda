import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { RichText, splitMath } from '../../src/renderer/components/RichText';

describe('RichText LaTeX (KaTeX)', () => {
  it('renders inline $...$ and \\(...\\) math with KaTeX', () => {
    const { container } = render(<RichText text={'A área é $\\pi r^2$ e a raiz é \\(\\sqrt{2}\\).'} />);
    expect(screen.getAllByTestId('math-inline')).toHaveLength(2);
    expect(container.querySelectorAll('.katex').length).toBe(2);
    expect(container.textContent).not.toContain('$\\pi');
  });

  it('renders $$...$$ as display math, even across lines', () => {
    render(<RichText text={'Fórmula:\n$$\n\\frac{a}{b} = c\n$$\nFim.'} />);
    const display = screen.getByTestId('math-display');
    expect(display.querySelector('.katex-display')).not.toBeNull();
  });

  it('keeps prices and lone dollar signs as plain text', () => {
    expect(splitMath('Custa R$ 5 e R$ 10.').every((p) => p.type === 'text')).toBe(true);
    expect(splitMath('US$5 ou US$10').every((p) => p.type === 'text')).toBe(true);
  });

  it('does not touch $ inside code blocks or inline code', () => {
    render(<RichText text={'Use `echo $HOME`:\n```bash\necho "$PATH" $x$\n```'} />);
    expect(screen.queryByTestId('math-inline')).toBeNull();
    expect(screen.getByTestId('inline-code').textContent).toBe('echo $HOME');
  });

  it('shows invalid LaTeX without crashing', () => {
    const { container } = render(<RichText text={'Erro: $\\frac{1}{$ aqui'} />);
    expect(container.textContent).toContain('aqui');
  });
});
