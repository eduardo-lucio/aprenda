import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DictationOverlay } from '../../src/renderer/components/DictationOverlay';

const animated = (c: HTMLElement) => Array.from(c.querySelectorAll('.dictated-word')).map((e) => e.textContent);

describe('DictationOverlay', () => {
  it('animates only words that are new or were corrected', () => {
    const { container, rerender } = render(<DictationOverlay value="já estava" />);
    expect(animated(container)).toEqual([]);

    rerender(<DictationOverlay value="já estava aqui" />);
    expect(animated(container)).toEqual(['aqui']);

    rerender(<DictationOverlay value="já estava aquilo agora" />);
    expect(animated(container)).toEqual(['aquilo', 'agora']);
  });

  it('keeps the same text as the field, spaces included', () => {
    const { container } = render(<DictationOverlay value={'a  b\nc'} />);
    expect(container.firstElementChild!.textContent).toBe('a  b\nc');
  });
});
