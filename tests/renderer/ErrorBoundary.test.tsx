import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/renderer/components/ErrorBoundary';

describe('ErrorBoundary (E4)', () => {
  it('shows a way out instead of a blank window, and recovers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    const Bomb = () => {
      if (shouldThrow) throw new Error('boom');
      return <div>Tela nova</div>;
    };
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert').textContent).toMatch(/algo deu errado/i);
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Tela nova')).toBeDefined();
  });
});
