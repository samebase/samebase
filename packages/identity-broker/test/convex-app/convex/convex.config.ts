import { defineApp } from "convex/server";
import identityBroker from "../../../src/hosts/convex/component/convex.config.ts";

const app = defineApp();
app.use(identityBroker);

export default app;
