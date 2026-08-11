import { defineSchema } from "convex/server";

import { accountDeletionTables } from "./accountDeletion/model";
import { vaultProvisioningTables } from "./appProvisioningModel";
import { vaultEditorTables } from "./editorModel";
import { githubAppSetupTables } from "./githubAppSetupModel";
import { githubUserAuthorizationTables } from "./githubUserAuthorizationModel";
import { identityTables } from "./identityModel";
import { mcpTables } from "./mcp/model";
import { organizationTables } from "./organizationModel";
import { organizationDeletionTables } from "./organizationDeletion/model";
import { organizationInvitationTables } from "./organizationInvitationModel";
import { organizationProviderCredentialTables } from "./organizationProviderCredentialModel";
import { userPreferenceTables } from "./userPreferenceModel";
import { vaultBranchTables } from "./vault/branchModel";
import { vaultConvexSchemaGraphTables } from "./vault/convexSchemaGraphModel";
import { vaultDashboardTables } from "./vault/dashboardModel";
import { vaultDeletionTables } from "./vault/deletion/model";
import { vaultFolderTables } from "./vault/folderModel";
import { vaultTables } from "./vault/model";
import { vaultOrganizationTreeTables } from "./vault/organizationTreeModel";

export default defineSchema({
  ...identityTables,
  ...organizationTables,
  ...organizationDeletionTables,
  ...organizationInvitationTables,
  ...githubAppSetupTables,
  ...githubUserAuthorizationTables,
  ...accountDeletionTables,
  ...organizationProviderCredentialTables,
  ...userPreferenceTables,
  ...vaultDashboardTables,
  ...vaultFolderTables,
  ...vaultOrganizationTreeTables,
  ...vaultTables,
  ...vaultBranchTables,
  ...vaultConvexSchemaGraphTables,
  ...vaultProvisioningTables,
  ...vaultDeletionTables,
  ...vaultEditorTables,
  ...mcpTables,
});
