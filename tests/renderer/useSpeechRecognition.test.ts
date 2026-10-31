import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechRecognition } from '../../src/renderer/hooks/useSpeechRecognition';

describe('useSpeechRecognition hook lifecycle and interim event filtering', () => {
  let mockRecognitionInstance: any;

  beforeEach(() => {
    mockRecognitionInstance = {
      continuous: false,
      interimResults: false,
      lang: '',
      start: vi.fn(),
      stop: vi.fn(),
      onresult: null,
      onerror: null,
      onend: null,
    };

    (window as any).webkitSpeechRecognition = vi.fn().mockImplementation(() => mockRecognitionInstance);
  });

  it('does NOT stop or re-initialize recognition when onResult callback reference changes', () => {
    let callback = vi.fn();
    const { rerender } = renderHook(({ cb }) => useSpeechRecognition(cb), {
      initialProps: { cb: callback },
    });

    // Recognition created once
    expect((window as any).webkitSpeechRecognition).toHaveBeenCalledTimes(1);

    // Re-render with brand new function reference
    callback = vi.fn();
    rerender({ cb: callback });

    // Stop should not have been called because recognition shouldn't reset on simple callback change
    expect(mockRecognitionInstance.stop).not.toHaveBeenCalled();
    expect((window as any).webkitSpeechRecognition).toHaveBeenCalledTimes(1);
  });

  it('only dispatches final speech results to onResult to prevent word duplication', () => {
    const callback = vi.fn();
    renderHook(() => useSpeechRecognition(callback));

    // Simulate interim event
    act(() => {
      mockRecognitionInstance.onresult({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'pacote' }], { isFinal: false }),
        ],
      });
    });

    // Interim result should not be dispatched to onResult
    expect(callback).not.toHaveBeenCalled();

    // Simulate final event
    act(() => {
      mockRecognitionInstance.onresult({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'pacote descartado' }], { isFinal: true }),
        ],
      });
    });

    expect(callback).toHaveBeenCalledWith('pacote descartado');
  });
});
