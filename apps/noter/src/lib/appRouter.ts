import { type RouterHistory } from "@tanstack/react-router";
import { getRouter } from "@/router";

export function createAppRouter(history: RouterHistory) {
  return getRouter(history);
}

export type AppRouter = ReturnType<typeof createAppRouter>;
