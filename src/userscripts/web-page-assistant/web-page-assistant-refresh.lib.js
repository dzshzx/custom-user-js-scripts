(function (globalScope) {
  'use strict';

  function createRefreshRuntime(adapters) {
    const {
      minIntervalMs,
      tickMs,
      now,
      setInterval: setTimer,
      clearInterval: clearTimer,
      reload,
      onStateChange,
    } = adapters;
    const emptyState = {
      activeMatch: null,
      targetTime: 0,
      remainingWhenPaused: 0,
      isPaused: false,
      isRefreshing: false,
      timerId: null,
    };
    let state = { ...emptyState };

    function clearActiveTimer() {
      if (!state.timerId) return;
      clearTimer(state.timerId);
      state = { ...state, timerId: null };
    }

    function snapshot() {
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

    function restart(activeMatch) {
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

  globalScope.WebPageAssistantRefreshLib = {
    createRefreshRuntime,
  };
}(globalThis));
