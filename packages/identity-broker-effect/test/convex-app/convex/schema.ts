// The app's own copy of the broker tables, for the adapter steps of `ops.ts`. The component keeps
// its tables apart, under its own name.
import { defineSchema } from "convex/server";
import { brokerTables } from "../../../src/hosts/convex/schema.ts";

export default defineSchema(brokerTables);
