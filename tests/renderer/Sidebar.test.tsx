import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../../src/renderer/components/Sidebar';

describe('Sidebar Component', () => {
  const sessions = [
    { id: '1', title: 'Camada 3 Modelo OSI', mode: 'teaching' as const, date: 'Hoje' },
    { id: '2', title: 'Cálculo de Sub-redes CIDR', mode: 'practice' as const, date: 'Ontem' },
  ];

  it('renders filter tabs TEACHING, PRACTICE, ALL and allows tab switching', () => {
    const onSelectSession = vi.fn();
    const onNewSession = vi.fn();

    render(
      <Sidebar
        sessions={sessions}
        activeSessionId="1"
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
      />
    );

    expect(screen.getByText('TEACHING')).toBeDefined();
    expect(screen.getByText('PRACTICE')).toBeDefined();
    expect(screen.getByText('ALL')).toBeDefined();

    // Click PRACTICE tab to filter
    fireEvent.click(screen.getByText('PRACTICE'));
    expect(screen.getByText('Cálculo de Sub-redes CIDR')).toBeDefined();
  });

  it('triggers onNewSession when + TEACHING button is clicked', () => {
    const onSelectSession = vi.fn();
    const onNewSession = vi.fn();

    render(
      <Sidebar
        sessions={sessions}
        activeSessionId="1"
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
      />
    );

    const newBtn = screen.getByText('+ TEACHING');
    fireEvent.click(newBtn);
    expect(onNewSession).toHaveBeenCalledWith('teaching');
  });

  it('triggers onSelectSession when clicking a session item', () => {
    const onSelectSession = vi.fn();
    const onNewSession = vi.fn();

    render(
      <Sidebar
        sessions={sessions}
        activeSessionId="1"
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
      />
    );

    const sessionItem = screen.getByText('Cálculo de Sub-redes CIDR');
    fireEvent.click(sessionItem);
    expect(onSelectSession).toHaveBeenCalledWith('2');
  });

  it('triggers onOpenSettings when clicking the settings button', () => {
    const onOpenSettings = vi.fn();
    render(
      <Sidebar
        sessions={sessions}
        activeSessionId="1"
        onSelectSession={vi.fn()}
        onNewSession={vi.fn()}
        onOpenSettings={onOpenSettings}
      />
    );

    const settingsBtn = screen.getByRole('button', { name: /configurações do agente/i });
    fireEvent.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('triggers onDeleteSession when clicking delete button on a session item', () => {
    const onDeleteSession = vi.fn();
    render(
      <Sidebar
        sessions={sessions}
        activeSessionId="1"
        onSelectSession={vi.fn()}
        onNewSession={vi.fn()}
        onDeleteSession={onDeleteSession}
      />
    );

    const deleteButtons = screen.getAllByTitle('Excluir sessão');
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);
    expect(onDeleteSession).toHaveBeenCalledWith('1');
  });
});
