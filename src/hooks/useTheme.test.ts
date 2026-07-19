// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from './useTheme';

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe('useTheme', () => {
  it('folgt ohne gespeicherte Wahl dem Betriebssystem', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    // Kein Attribut heißt: die Media Query entscheidet, wie vor dem Schalter.
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('schreibt die Wahl an das Wurzelelement, wo das CSS sie greift', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => result.current.setTheme('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('überlebt einen Reload — und „Automatisch" räumt den Eintrag wieder weg', () => {
    const first = renderHook(() => useTheme());
    act(() => first.result.current.setTheme('dark'));
    first.unmount();

    expect(renderHook(() => useTheme()).result.current.theme).toBe('dark');

    const second = renderHook(() => useTheme());
    act(() => second.result.current.setTheme('system'));
    second.unmount();

    expect(window.localStorage.getItem('fretboard:theme')).toBeNull();
    expect(renderHook(() => useTheme()).result.current.theme).toBe('system');
  });

  it('stirbt nicht an einem localStorage, das wirft', () => {
    // Safari im privaten Modus. Eine Farbe darf die App nicht kosten.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');

    act(() => result.current.setTheme('dark'));
    // Die Wahl greift trotzdem, sie überlebt nur den Reload nicht.
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
