export const textJob = {
  componentConfig: "./feature/convex/convex.config.ts",
  workerEntry: "./feature/worker.ts",
  binding: {
    componentUrl: "WORKER_URL",
    componentSecret: "WORKER_SECRET",
    workerSecret: "BRIDGE_SECRET",
  },
} as const;
