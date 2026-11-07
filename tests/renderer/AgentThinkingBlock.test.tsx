import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AgentThinkingBlock } from '../../src/renderer/components/AgentThinkingBlock';
import { I18nProvider } from '../../src/renderer/i18n';

describe('AgentThinkingBlock', () => {
  it('shows a discreet indicator on the LEFT of the label while streaming, with no green spinner', () => {
    const { container } = render(
      <AgentThinkingBlock thinkingText="Lendo sua resposta" isStreaming statusLabel="Montando o plano..." />
    );
    const button = screen.getByRole('button');
    const indicator = screen.getByTestId('thinking-indicator');
    const label = screen.getByText('Raciocínio do tutor');
    expect(button.firstElementChild).toBe(indicator);
    expect(indicator.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.innerHTML).not.toMatch(/emerald/);
    expect(screen.getByText('Montando o plano...')).toBeDefined();
  });

  it('shows no indicator once the reasoning is finished', () => {
    render(<AgentThinkingBlock thinkingText="Pronto." defaultExpanded />);
    expect(screen.queryByTestId('thinking-indicator')).toBeNull();
    expect(screen.getByText('Pronto.')).toBeDefined();
  });

  it('is translated to English', () => {
    render(
      <I18nProvider lang="en">
        <AgentThinkingBlock isStreaming />
      </I18nProvider>
    );
    expect(screen.getByText("Tutor's reasoning")).toBeDefined();
    expect(screen.getByText('Thinking…')).toBeDefined();
  });
});
