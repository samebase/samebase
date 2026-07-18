import { defineSchema } from "convex/server";

import { accountDeletionTables } from "./accountDeletion/model";
import { agentTables } from "./agent/model";
import { appProvisioningTables } from "./appProvisioningModel";
import { chatTables } from "./chat/model";
import { prodAccessTables } from "./chat/prodAccessModel";
import { codespacesTables } from "./codespaces/model";
import { commitCheckTables } from "./commitCheckModel";
import { connectedMachineTables } from "./connectedMachineModel";
import { editorTables } from "./editorModel";
import { identityTables } from "./identityModel";
import { mcpTables } from "./mcp/model";
import { providerConnectionTables } from "./providerConnectionModel";
import { repositoryRefreshTables } from "./repositoryRefreshModel";
import { userPreferenceTables } from "./userPreferenceModel";
import { vaultBranchTables } from "./vault/branchModel";
import { convexSchemaGraphTables } from "./vault/convexSchemaGraphModel";
import { vaultDashboardTables } from "./vault/dashboardModel";
import { vaultDeletionTables } from "./vault/deletion/model";
import { vaultTables } from "./vault/model";

export default defineSchema({
  ...identityTables,
  ...accountDeletionTables,
  ...agentTables,
  ...providerConnectionTables,
  ...connectedMachineTables,
  ...userPreferenceTables,
  ...vaultDashboardTables,
  ...vaultTables,
  ...vaultBranchTables,
  ...commitCheckTables,
  ...convexSchemaGraphTables,
  ...repositoryRefreshTables,
  ...appProvisioningTables,
  ...vaultDeletionTables,
  ...codespacesTables,
  ...editorTables,
  ...chatTables,
  ...prodAccessTables,
  ...mcpTables,
});
