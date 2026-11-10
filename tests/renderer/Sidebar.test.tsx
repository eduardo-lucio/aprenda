import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../../src/renderer/components/Sidebar';

describe('Sidebar Component', () => {
  const sessions = [
    { id: '1', title: 'Camada 3 Modelo OSI', mode: 'teaching' as const, date: 'Hoje' },
    { id: '2', title: 'Cálculo de Sub-redes CIDR', mode: 'practice' as const, date: 'Ontem' },
  ];

  it('a single "+ Nova sessão" action, no mode filter tabs, and practice sessions marked as such', () => {
    render(<Sidebar sessions={sessions} activeSessionId="1" onSelectSession={vi.fn()} onNewSession={vi.fn()} />);

    expect(screen.getByText('+ Nova sessão')).toBeDefined();
    expect(screen.queryByText('TEACHING')).toBeNull();
    expect(screen.queryByText('ALL')).toBeNull();
    // A1: only the practice session carries the tag
    const tags = screen.getAllByText('Prática');
    expect(tags).toHaveLength(1);
    expect(tags[0].closest('button')!.textContent).toContain('Cálculo de Sub-redes CIDR');
  });

  it('filters sessions by the search text', () => {
    render(<Sidebar sessions={sessions} activeSessionId="1" onSelectSession={vi.fn()} onNewSession={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: 'cidr' } });
    expect(screen.getByText('Cálculo de Sub-redes CIDR')).toBeDefined();
    expect(screen.queryByText('Camada 3 Modelo OSI')).toBeNull();
  });

  it('triggers onNewSession when + Nova sessão is clicked', () => {
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

    const newBtn = screen.getByText('+ Nova sessão');
    fireEvent.click(newBtn);
    expect(onNewSession).toHaveBeenCalledTimes(1);
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

    const settingsBtn = screen.getByRole('button', { name: /^configurações$/i });
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
    expect(onDeleteSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar?' }));
    expect(onDeleteSession).toHaveBeenCalledWith('1');
  });
});
