import { query } from "./_generated/server";

export const getWelcomeMessage = query({
  args: {},
  handler: async () => {
    return {
      title: "Convex is wired",
      detail: "Next commit adds Tailwind + shadcn, then CRUD.",
      generatedAt: Date.now(),
    };
  },
});
