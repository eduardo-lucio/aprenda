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

describe('RichText Markdown (U1)', () => {
  it('renders headings, bold, lists and tables instead of raw markers', () => {
    const { container } = render(
      <RichText text={'## Título\n\nTexto **forte**\n\n- item um\n- item dois\n\n| A | B |\n|---|---|\n| 1 | 2 |'} />
    );
    expect(container.querySelector('h3')?.textContent).toBe('Título');
    expect(container.querySelector('strong')?.textContent).toBe('forte');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.textContent).not.toMatch(/##|\*\*|\|---/);
  });

  it('renders the callout as a block, without its marker', () => {
    render(<RichText text={'> [!IMPORTANT]\n> Ideia central.'} />);
    const callout = screen.getByTestId('callout');
    expect(callout.textContent).toContain('Ideia central.');
    expect(callout.textContent).not.toContain('[!IMPORTANT]');
  });

  it('keeps Markdown out of formulas', () => {
    const { container } = render(<RichText text={'Seja $a_1 * b_1 * c_1$ e **isto** forte.'} />);
    expect(screen.getByTestId('math-inline').textContent).toContain('a');
    expect(container.querySelectorAll('em')).toHaveLength(0);
    expect(container.querySelector('strong')?.textContent).toBe('isto');
  });

  it('keeps fenced code, inline code and display math working together', () => {
    render(<RichText text={'Use `x_y` aqui:\n\n```js\nconst a = 1;\n```\n\n$$E = mc^2$$'} />);
    expect(screen.getByTestId('inline-code').textContent).toBe('x_y');
    expect(screen.getByTestId('code-block')).toBeDefined();
    expect(screen.getByTestId('math-display')).toBeDefined();
  });

  it('does not render raw HTML or images from the model', () => {
    const { container } = render(<RichText text={'<img src=x onerror=alert(1)> ![a](http://x/y.png)'} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps single line breaks', () => {
    const { container } = render(<RichText text={'linha um\nlinha dois'} />);
    expect(container.querySelector('p')?.className).toContain('whitespace-pre-line');
  });
});
