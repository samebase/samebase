import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src",
  prerender: ["/"],
  ssr: false,
} satisfies Config;
