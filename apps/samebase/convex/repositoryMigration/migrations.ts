import { Migrations } from "@convex-dev/migrations";

import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";

export const repositoryMigrations = new Migrations<DataModel>(components.migrations, {
  defaultBatchSize: 25,
  internalMutation,
});
