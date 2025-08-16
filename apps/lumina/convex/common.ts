import { getAuthUserId } from "@convex-dev/auth/server";
import { Auth } from "convex/server";

export async function getUserId(ctx: { auth: Auth }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("User not authenticated");
  }
  return userId;
}

/**
 * Run at most `limit` async tasks at once.
 *
 * @param tasks  An array of functions returning a Promise
 * @param limit  Max number of concurrent executions
 */
export async function allLimited<T>(
  tasks: (() => Promise<T>)[],
  limit = 50,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  return new Promise((resolve, reject) => {
    let active = 0;

    function runNext() {
      if (nextIndex >= tasks.length) {
        if (active === 0) resolve(results);
        return;
      }

      const i = nextIndex++;
      active++;
      tasks[i]()
        .then((res) => {
          results[i] = res;
        })
        .catch(reject)
        .finally(() => {
          active--;
          runNext();
        });
    }

    for (let i = 0; i < Math.min(limit, tasks.length); i++) {
      runNext();
    }
  });
}
