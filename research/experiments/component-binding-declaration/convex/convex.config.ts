import { defineApp } from "convex/server";
import { environment, mount } from "../convex-adapter.ts";
import component from "../feature/convex/convex.config.ts";

const app = defineApp({ env: environment });
mount(app, component);
export default app;
