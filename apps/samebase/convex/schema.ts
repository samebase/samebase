import { defineSchema } from "convex/server";

import { accountDeletionTables } from "./accountDeletion/model";
import { githubAppSetupTables } from "./githubAppSetupModel";
import { githubUserAuthorizationTables } from "./githubUserAuthorizationModel";
import { identityTables } from "./identity/model";
import { mcpTables } from "./mcp/model";
import { organizationTables } from "./organization/model";
import { organizationInvitationTables } from "./organization/invitationModel";
import { organizationProviderCredentialTables } from "./organization/providerCredentialModel";
import { repositoryBranchTables } from "./repository/branchModel";
import { repositoryConvexSchemaGraphTables } from "./repository/convexSchemaGraphModel";
import { repositoryDashboardTables } from "./repository/dashboardModel";
import { repositoryDeletionTables } from "./repository/deletion/model";
import { repositoryEditorTables } from "./repository/editorModel";
import { repositoryFolderTables } from "./repository/folderModel";
import { repositoryTables } from "./repository/model";
import { repositoryOrganizationTreeTables } from "./repository/organizationTreeModel";
import { repositoryProvisioningTables } from "./repository/provisioningModel";
import { userPreferenceTables } from "./userPreferenceModel";

export default defineSchema({
  ...identityTables,
  ...organizationTables,
  ...organizationInvitationTables,
  ...githubAppSetupTables,
  ...githubUserAuthorizationTables,
  ...accountDeletionTables,
  ...organizationProviderCredentialTables,
  ...userPreferenceTables,
  ...repositoryDashboardTables,
  ...repositoryFolderTables,
  ...repositoryOrganizationTreeTables,
  ...repositoryTables,
  ...repositoryBranchTables,
  ...repositoryConvexSchemaGraphTables,
  ...repositoryProvisioningTables,
  ...repositoryDeletionTables,
  ...repositoryEditorTables,
  ...mcpTables,
});
