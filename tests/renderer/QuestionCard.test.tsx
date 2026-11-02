import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionCard } from '../../src/renderer/components/QuestionCard';
import { QuestionData } from '../../src/shared/types';

describe('QuestionCard Component', () => {
  const sampleQuestion: QuestionData = {
    id: 'q-test-1',
    nodeId: 'osi-l3-ttl',
    questionText: 'O que acontece quando o TTL atinge 0?',
    options: [
      'O pacote é descartado e é gerado ICMP Time Exceeded',
      'O pacote é retransmitido em loop',
      'O pacote é convertido para broadcast',
      'O cabeçalho IP é ignorado',
    ],
    correctOptionIndex: 0,
    anchorConcept: 'TTL e Prevenção de Loops',
    difficulty: 3,
  };

  it('blocks submission and displays friendly prompt when thinkingText is blank', () => {
    const onSubmit = vi.fn();
    render(<QuestionCard question={sampleQuestion} onSubmit={onSubmit} />);

    // Select an option
    const option = screen.getByText('O pacote é descartado e é gerado ICMP Time Exceeded');
    fireEvent.click(option);

    // Click submit with empty thinking
    const submitBtn = screen.getByRole('button', { name: /enviar resposta|submit answer/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/explique seu raciocínio com pelo menos algumas palavras/i)
    ).toBeDefined();
  });

  it('emits selected option, confidence percentage, and thinking text on submit', () => {
    const onSubmit = vi.fn();
    render(<QuestionCard question={sampleQuestion} onSubmit={onSubmit} />);

    // Select option 0
    fireEvent.click(screen.getByText('O pacote é descartado e é gerado ICMP Time Exceeded'));

    // Fill thinking text
    const textarea = screen.getByPlaceholderText(/escreva ou dite seu raciocínio/i);
    fireEvent.change(textarea, {
      target: { value: 'Cada roteador decrementa 1 no TTL. Ao chegar a 0, descarta.' },
    });

    // Adjust confidence slider to 85%
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '85' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /enviar resposta|submit answer/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      selectedOptionIndex: 0,
      confidence: 85,
      thinkingText: 'Cada roteador decrementa 1 no TTL. Ao chegar a 0, descarta.',
    });
  });

  it('toggles voice dictation button safely without crashing', () => {
    const onSubmit = vi.fn();
    render(<QuestionCard question={sampleQuestion} onSubmit={onSubmit} />);

    const micBtn = screen.getByTitle(/ditar raciocínio por voz/i);
    expect(micBtn).toBeDefined();
    fireEvent.click(micBtn);
    // Button state should toggle without crashing even if Web Speech API is absent in test
    expect(micBtn).toBeDefined();
  });

  it('resets selected option, custom input, and thinking text when question changes', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<QuestionCard question={sampleQuestion} onSubmit={onSubmit} />);

    // Select option 0
    const option0 = screen.getByText('O pacote é descartado e é gerado ICMP Time Exceeded');
    fireEvent.click(option0);

    // Fill thinking text
    const textarea = screen.getByPlaceholderText(/escreva ou dite seu raciocínio/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Minha justificativa anterior' } });
    expect(textarea.value).toBe('Minha justificativa anterior');

    // Rerender with next question
    const nextQuestion: QuestionData = {
      id: 'q-test-2',
      nodeId: 'osi-l3-ip-packets',
      questionText: 'Qual o campo do cabeçalho IPv4 que impede loops infinitos?',
      options: ['TTL', 'Checksum', 'Protocol', 'Fragment Offset'],
      correctOptionIndex: 0,
      anchorConcept: 'Pacotes IP',
      difficulty: 2,
    };

    rerender(<QuestionCard question={nextQuestion} onSubmit={onSubmit} />);

    // Thinking text must be completely cleared
    const updatedTextarea = screen.getByPlaceholderText(/escreva ou dite seu raciocínio/i) as HTMLTextAreaElement;
    expect(updatedTextarea.value).toBe('');

    // Clicking submit must fail because no option is selected
    const submitBtn = screen.getByRole('button', { name: /enviar resposta|submit answer/i });
    fireEvent.click(submitBtn);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/selecione uma alternativa ou clique em "não sei"/i)).toBeDefined();
  });

  it('allows selecting "Não sei" and submitting with default frontier thinking', () => {
    const onSubmit = vi.fn();
    render(<QuestionCard question={sampleQuestion} onSubmit={onSubmit} />);

    // Click "Não sei"
    const dontKnowOption = screen.getByText(/não sei \/ ainda não domino este conceito/i);
    fireEvent.click(dontKnowOption);

    // Submit directly without typing custom thinking
    const submitBtn = screen.getByRole('button', { name: /enviar resposta|submit answer/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      selectedOptionIndex: -1,
      confidence: 0,
      thinkingText: expect.stringMatching(/não sei responder/i),
    });
  });
});
