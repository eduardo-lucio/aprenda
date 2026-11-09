import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { HeroHeadline } from '../../src/renderer/components/HeroHeadline';

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const title = () => screen.getByTestId('hero-title').textContent;
const subtitle = () => screen.getByTestId('hero-subtitle').textContent;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HeroHeadline', () => {
  it('types the title, then the subtitle, and moves on to another phrase', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    render(<HeroHeadline active />);
    expect(screen.getByRole('heading', { name: 'O que você quer aprender?' })).toBeDefined();

    await advance(200);
    expect(title()).not.toBe('> O que você quer aprender?');
    expect(title()!.startsWith('> O')).toBe(true);
    expect(subtitle()).toBe('');

    await advance(4000);
    expect(title()).toBe('> O que você quer aprender?');
    expect(subtitle()).toContain('Escreva um tema');

    await advance(7500);
    expect(title()).toBe('> Qual tema vamos explorar?');
    expect(subtitle()).toContain('o que você já sabe.');
  });

  it('stops typing once the prompt has been sent', async () => {
    vi.useFakeTimers();
    const { rerender } = render(<HeroHeadline active />);
    await advance(300);
    rerender(<HeroHeadline active={false} />);
    const frozen = title();
    await advance(5000);
    expect(title()).toBe(frozen);
  });

  it('shows the full text at once when the system asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<HeroHeadline active />);
    expect(title()).toBe('> O que você quer aprender?');
    expect(subtitle()).toContain('Escreva um tema');
    expect(document.querySelector('.hero-cursor')).toBeNull();
  });
});
