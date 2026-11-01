import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { defineComponent } from "convex/server";

const component = defineComponent("identityBroker");
component.use(rateLimiter);

export default component;
