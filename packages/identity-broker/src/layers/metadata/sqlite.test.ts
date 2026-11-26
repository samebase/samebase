// The metadata layer's sign-in tests on the node:sqlite Store: the same test file as on the memory
// Store, each broker on a fresh in-memory SQLite database.
import { DatabaseSync } from "node:sqlite";
import { sqliteTestStore, useTestStore } from "../../core/testing/harness.ts";

useTestStore((now) => sqliteTestStore(new DatabaseSync(":memory:"), now));

await import("./signIn.test.ts");
