import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  run: {
    tasks: {
      "typecheck:cached": {
        command: "tsc -b --pretty false",
        input: [{ auto: true }, "!node_modules/.tmp/**"],
      },
    },
  },
  server: {
    port: 43130,
    strictPort: false,
  },
  preview: {
    port: 43131,
    strictPort: false,
  },
  plugins: [tailwindcss(), solid()],
});
