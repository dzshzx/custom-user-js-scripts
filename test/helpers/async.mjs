// Promise with its resolve/reject exposed, for tests that settle work by hand.
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Lets pending timers and microtasks run; ms > 0 waits that long.
export const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
