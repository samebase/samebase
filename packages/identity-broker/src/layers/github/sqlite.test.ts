// The GitHub layer's sign-in tests on the node:sqlite Store: the same test files as on the memory
// Store, each broker on a fresh in-memory SQLite database.
import { DatabaseSync } from "node:sqlite";
import { sqliteTestStore, useTestStore } from "../../core/testing/harness.ts";

useTestStore((now) => sqliteTestStore(new DatabaseSync(":memory:"), now));

await import("./connectorGrants.test.ts");
await import("./signInPage.test.ts");
await import("../../moderation/moderation.test.ts");
