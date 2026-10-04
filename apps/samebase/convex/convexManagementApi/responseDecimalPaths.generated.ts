// Generated from https://api.convex.dev/v1/openapi.json. Do not edit by hand.

export type ConvexManagementResponseDecimalPath = readonly string[];

export const convexManagementResponseDecimalPaths = {
  GET: {
    "/projects/{project_id}": [["id"], ["teamId"]],
    "/teams/{team_id}/projects": [
      ["items", "*", "id"],
      ["items", "*", "teamId"],
    ],
    "/projects/{project_id}/list_deployments": [
      ["*", "creator"],
      ["*", "id"],
      ["*", "projectId"],
    ],
    "/projects/{project_id}/deployment": [["creator"], ["id"], ["projectId"]],
    "/teams/{team_id_or_slug}/projects/{project_slug}/deployment": [
      ["creator"],
      ["id"],
      ["projectId"],
    ],
    "/teams/{team_id_or_slug}/projects/{project_slug}": [["id"], ["teamId"]],
    "/deployments/{deployment_name}": [["creator"], ["id"], ["projectId"]],
    "/teams/{team_id}/list_deployment_classes": [],
    "/teams/{team_id}/list_deployment_regions": [],
    "/teams/{team_id}/list_deployments": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
      ["items", "*", "projectId"],
    ],
    "/teams/{team_id}/list_local_deployments": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
      ["items", "*", "projectId"],
    ],
    "/deployments/{deployment_name}/list_deploy_keys": [
      ["*", "creator"],
      ["*", "id"],
    ],
    "/projects/{project_id}/list_preview_deploy_keys": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
    ],
    "/list_personal_access_tokens": [
      ["items", "*", "id"],
      ["items", "*", "ssoTeamId"],
    ],
    "/teams/{team_id}/list_access_tokens": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
    ],
    "/token_details": [["id"], ["projectId"], ["teamId"]],
    "/deployments/{deployment_name}/custom_domains": [],
    "/teams/{team_id}/list_members": [
      ["items", "*", "customRoles", "*", "id"],
      ["items", "*", "id"],
    ],
    "/teams/{team_id}/list_audit_log_events": [
      ["items", "*", "actor", "member_id"],
      ["items", "*", "actor", "token_id"],
      ["items", "*", "teamId"],
    ],
    "/teams/{team_id}/list_pending_invites": [["items", "*", "customRoles", "*", "id"]],
    "/projects/{project_id}/list_default_environment_variables": [],
    "/teams/{team_id}/list_custom_roles": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
      ["items", "*", "teamId"],
    ],
  },
  POST: {
    "/teams/{team_id}/create_project": [["id"], ["projectId"]],
    "/projects/{project_id}/delete": [],
    "/projects/{project_id}/create_deployment": [["creator"], ["id"], ["projectId"]],
    "/deployments/{deployment_name}/delete": [],
    "/deployments/{deployment_name}/transfer": [],
    "/deployments/{deployment_name}/mint_ai_gateway_jwt": [],
    "/deployments/{deployment_name}/create_deploy_key": [],
    "/deployments/{deployment_name}/delete_deploy_key": [],
    "/projects/{project_id}/create_preview_deploy_key": [],
    "/projects/{project_id}/delete_preview_deploy_key": [],
    "/create_personal_access_token": [],
    "/delete_personal_access_token": [],
    "/teams/{team_id}/delete_access_token": [],
    "/deployments/{deployment_name}/create_custom_domain": [],
    "/deployments/{deployment_name}/delete_custom_domain": [],
    "/teams/create_team": [["creator"], ["id"], ["referredBy"]],
    "/teams/{team_id}/create_access_token": [],
    "/teams/{team_id}/invite_team_member": [],
    "/teams/{team_id}/cancel_team_member_invite": [],
    "/projects/{project_id}/update_default_environment_variables": [],
    "/teams/{team_id}/create_custom_role": [["creator"], ["id"], ["teamId"]],
    "/teams/{team_id}/update_custom_role": [["creator"], ["id"], ["teamId"]],
    "/teams/{team_id}/delete_custom_role": [],
    "/teams/{team_id}/update_team_member_role": [],
  },
  PATCH: {
    "/projects/{project_id}": [["id"], ["teamId"]],
    "/deployments/{deployment_name}": [],
  },
} as const;
