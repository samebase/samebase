/** Runs at most `limit` calls at once. A finished call hands its place to the next waiting one. */
export function limiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <Result>(run: () => Promise<Result>) => {
    if (active < limit) {
      active++;
    } else {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
}
