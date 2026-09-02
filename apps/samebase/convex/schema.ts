import { defineSchema } from "convex/server";

import { accountDeletionTables } from "./accountDeletion/model";
import { vaultProvisioningTables } from "./appProvisioningModel";
import { vaultEditorTables } from "./editorModel";
import { githubAppSetupTables } from "./githubAppSetupModel";
import { githubUserAuthorizationTables } from "./githubUserAuthorizationModel";
import { identityTables } from "./identityModel";
import { mcpTables } from "./mcp/model";
import { organizationTables } from "./organizationModel";
import { organizationInvitationTables } from "./organizationInvitationModel";
import { organizationProviderCredentialTables } from "./organizationProviderCredentialModel";
import { repositoryBranchTables } from "./repository/branchModel";
import { repositoryConvexSchemaGraphTables } from "./repository/convexSchemaGraphModel";
import { repositoryDashboardTables } from "./repository/dashboardModel";
import { repositoryDeletionTables } from "./repository/deletion/model";
import { repositoryEditorTables } from "./repository/editorModel";
import { repositoryFolderTables } from "./repository/folderModel";
import { repositoryTables } from "./repository/model";
import { repositoryOrganizationTreeTables } from "./repository/organizationTreeModel";
import { repositoryProvisioningTables } from "./repository/provisioningModel";
import { repositoryMigrationTables } from "./repositoryMigration/model";
import { repositoryMigrationMaintenanceTables } from "./repositoryMigration/maintenanceModel";
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
  ...repositoryDashboardTables,
  ...repositoryFolderTables,
  ...repositoryOrganizationTreeTables,
  ...repositoryTables,
  ...repositoryBranchTables,
  ...repositoryConvexSchemaGraphTables,
  ...repositoryProvisioningTables,
  ...repositoryDeletionTables,
  ...repositoryEditorTables,
  ...repositoryMigrationTables,
  ...repositoryMigrationMaintenanceTables,
  ...mcpTables,
});
