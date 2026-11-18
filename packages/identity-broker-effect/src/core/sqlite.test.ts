// The sign-in suite of the core on builder A's node:sqlite Store: the same test files as on the
// memory Store, each `createBroker` on a fresh in-memory SQLite database.
import { DatabaseSync } from "node:sqlite";
import { sqliteTestStore, useTestStore } from "./testing/harness.ts";

useTestStore((now) => sqliteTestStore(new DatabaseSync(":memory:"), now));

await import("./broker.test.ts");
await import("./conformance.test.ts");
await import("./signInPage.test.ts");
await import("./connectorGrants.test.ts");
await import("./callbackRaces.test.ts");
await import("./sentinels.test.ts");
await import("./signin.model.test.ts");
