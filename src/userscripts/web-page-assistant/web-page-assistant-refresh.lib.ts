import type { RefreshMatch } from './web-page-assistant-settings.lib.ts';

export type RefreshTimerId = number;

export interface RefreshSnapshot {
  activeMatch: RefreshMatch | null;
  isPaused: boolean;
  isRefreshing: boolean;
  remainingMs: number;
}

export interface RefreshRuntimeAdapters {
  minIntervalMs: number;
  tickMs: number;
  now: () => number;
  setInterval: (handler: () => void, delay: number) => RefreshTimerId;
  clearInterval: (timer: RefreshTimerId) => void;
  reload: () => void;
  onStateChange: (snapshot: RefreshSnapshot) => void;
}

interface RefreshState {
  activeMatch: RefreshMatch | null;
  targetTime: number;
  remainingWhenPaused: number;
  isPaused: boolean;
  isRefreshing: boolean;
  timerId: RefreshTimerId | null;
}

export interface RefreshRuntime {
  restart(activeMatch: RefreshMatch | null | undefined): void;
  stop(): void;
  togglePause(): RefreshSnapshot;
  getState(): RefreshSnapshot;
  tick(): void;
}

function createRefreshRuntime(adapters: RefreshRuntimeAdapters): RefreshRuntime {
  const {
    minIntervalMs,
    tickMs,
    now,
    setInterval: setTimer,
    clearInterval: clearTimer,
    reload,
    onStateChange,
  } = adapters;
  const emptyState: RefreshState = {
    activeMatch: null,
    targetTime: 0,
    remainingWhenPaused: 0,
    isPaused: false,
    isRefreshing: false,
    timerId: null,
  };
  let state: RefreshState = { ...emptyState };

  function clearActiveTimer() {
    if (!state.timerId) return;
    clearTimer(state.timerId);
    state = { ...state, timerId: null };
  }

  function snapshot(): RefreshSnapshot {
    const remainingMs = state.activeMatch
      ? state.isPaused
        ? state.remainingWhenPaused
        : Math.max(0, state.targetTime - now())
      : 0;
    return {
      activeMatch: state.activeMatch,
      isPaused: state.isPaused,
      isRefreshing: state.isRefreshing,
      remainingMs,
    };
  }

  function emit() {
    onStateChange(snapshot());
  }

  function tick() {
    if (!state.activeMatch || state.isPaused || state.isRefreshing) {
      emit();
      return;
    }

    const remainingMs = state.targetTime - now();
    emit();
    if (remainingMs > 0) return;

    state = { ...state, isRefreshing: true };
    clearActiveTimer();
    emit();
    reload();
  }

  function startTimer() {
    clearActiveTimer();
    if (!state.activeMatch || state.isPaused) {
      emit();
      return;
    }

    state = { ...state, timerId: setTimer(tick, tickMs) };
    tick();
  }

  function restart(activeMatch: RefreshMatch | null | undefined) {
    clearActiveTimer();
    if (!activeMatch) {
      state = { ...emptyState };
      emit();
      return;
    }

    state = {
      ...emptyState,
      activeMatch,
      targetTime: now() + activeMatch.setting.intervalMs,
    };
    startTimer();
  }

  function stop() {
    clearActiveTimer();
    state = { ...emptyState };
    emit();
  }

  function togglePause() {
    if (!state.activeMatch) return snapshot();

    if (state.isPaused) {
      state = {
        ...state,
        targetTime: now() + state.remainingWhenPaused,
        remainingWhenPaused: 0,
        isPaused: false,
      };
      startTimer();
      return snapshot();
    }

    state = {
      ...state,
      remainingWhenPaused: Math.max(minIntervalMs, state.targetTime - now()),
      isPaused: true,
    };
    clearActiveTimer();
    emit();
    return snapshot();
  }

  return {
    restart,
    stop,
    togglePause,
    getState: snapshot,
    tick,
  };
}

export { createRefreshRuntime };
