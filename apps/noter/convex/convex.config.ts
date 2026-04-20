import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import noterCreate from "@noter-md/noter-create/convex.config.js";

const app = defineApp();

app.use(noterCreate);
app.use(agent);

export default app;
