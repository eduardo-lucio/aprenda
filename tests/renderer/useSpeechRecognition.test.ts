import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { applyDictation, useSpeechRecognition } from '../../src/renderer/hooks/useSpeechRecognition';

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

  it('streams interim words as they are recognized, then hands over the final text', () => {
    const onFinal = vi.fn();
    const onInterim = vi.fn();
    renderHook(() => useSpeechRecognition(onFinal, onInterim));
    const fire = (transcript: string, isFinal: boolean) =>
      act(() => mockRecognitionInstance.onresult({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal })] }));

    fire('pacote', false);
    fire('pacote desc', false);
    expect(onInterim.mock.calls.map((c) => c[0])).toEqual(['pacote', 'pacote desc']);
    fire('pacote descartado', true);
    expect(onFinal).toHaveBeenCalledWith('pacote descartado');
  });

  it('keeps unconfirmed words in the text when recognition ends', () => {
    const onFinal = vi.fn();
    renderHook(() => useSpeechRecognition(onFinal, vi.fn()));
    act(() => mockRecognitionInstance.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'quase' }], { isFinal: false })] }));
    act(() => mockRecognitionInstance.onend());
    expect(onFinal).toHaveBeenCalledWith('quase');
  });
});

describe('applyDictation', () => {
  it('replaces only the words still being recognized', () => {
    expect(applyDictation('', '', 'ola')).toBe('ola');
    expect(applyDictation('Oi ola', 'ola', 'ola mundo')).toBe('Oi ola mundo');
    expect(applyDictation('Oi ola', 'ola', '')).toBe('Oi');
  });

  it('keeps what the student edited meanwhile', () => {
    expect(applyDictation('texto novo', 'ola', 'ola mundo')).toBe('texto novo ola mundo');
  });
});
