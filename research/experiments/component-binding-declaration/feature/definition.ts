export const textJob = {
  workerEntry: "./feature/worker.ts",
  binding: {
    componentUrl: "WORKER_URL",
    componentSecret: "WORKER_SECRET",
    workerSecret: "BRIDGE_SECRET",
  },
} as const;
