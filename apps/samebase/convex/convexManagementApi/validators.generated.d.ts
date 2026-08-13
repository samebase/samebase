// Generated from https://api.convex.dev/v1/openapi.json. Do not edit by hand.

import type { SuccessResponseJSON } from "openapi-typescript-helpers";
import type { operations } from "./types.generated";

export type AjvStandaloneValidationError = {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message?: string;
  params?: unknown;
};

export type AjvStandaloneValidateFunction<T> = {
  (payload: unknown): payload is T;
  errors: AjvStandaloneValidationError[] | null;
};

export type ConvexManagementResponseDecimalPath = readonly string[];

export const convexManagementResponseValidators: {
  GET: {
    "/projects/{project_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["get project by id"]>
    >;
    "/teams/{team_id}/projects": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list projects"]>
    >;
    "/projects/{project_id}/list_deployments": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list deployments"]>
    >;
    "/projects/{project_id}/deployment": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["get deployment in project by project id"]>
    >;
    "/teams/{team_id_or_slug}/projects/{project_slug}/deployment": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["get deployment in project by project slug"]>
    >;
    "/teams/{team_id_or_slug}/projects/{project_slug}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["get project by slug"]>
    >;
    "/deployments/{deployment_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["platform_get_deployment"]>
    >;
    "/teams/{team_id}/list_deployment_classes": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list deployment classes"]>
    >;
    "/teams/{team_id}/list_deployment_regions": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list deployment regions"]>
    >;
    "/teams/{team_id}/list_deployments": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list deployments for team"]>
    >;
    "/teams/{team_id}/list_local_deployments": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list local deployments for team"]>
    >;
    "/deployments/{deployment_name}/list_deploy_keys": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list deploy keys"]>
    >;
    "/projects/{project_id}/list_preview_deploy_keys": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list preview deploy keys"]>
    >;
    "/list_personal_access_tokens": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list personal access tokens"]>
    >;
    "/teams/{team_id}/list_access_tokens": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list team access tokens"]>
    >;
    "/token_details": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["get token details"]>
    >;
    "/deployments/{deployment_name}/custom_domains": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list custom domains"]>
    >;
    "/teams/{team_id}/list_members": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list team members"]>
    >;
    "/teams/{team_id}/list_audit_log_events": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list audit log events"]>
    >;
    "/teams/{team_id}/list_pending_invites": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list pending team invites"]>
    >;
    "/projects/{project_id}/list_default_environment_variables": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list default environment variables"]>
    >;
    "/teams/{team_id}/list_custom_roles": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["list custom roles"]>
    >;
  };

  POST: {
    "/teams/{team_id}/create_project": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["create project"]>
    >;
    "/projects/{project_id}/delete": null;
    "/projects/{project_id}/create_deployment": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["create deployment"]>
    >;
    "/deployments/{deployment_name}/delete": null;
    "/deployments/{deployment_name}/transfer": null;
    "/deployments/{deployment_name}/create_deploy_key": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["create deploy key"]>
    >;
    "/deployments/{deployment_name}/delete_deploy_key": null;
    "/projects/{project_id}/create_preview_deploy_key": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["create preview deploy key"]>
    >;
    "/projects/{project_id}/delete_preview_deploy_key": null;
    "/create_personal_access_token": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["create personal access token"]>
    >;
    "/delete_personal_access_token": null;
    "/teams/{team_id}/delete_access_token": null;
    "/deployments/{deployment_name}/create_custom_domain": null;
    "/deployments/{deployment_name}/delete_custom_domain": null;
    "/teams/create_team": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["create team"]>
    >;
    "/teams/{team_id}/create_access_token": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["create team access token"]>
    >;
    "/teams/{team_id}/invite_team_member": null;
    "/teams/{team_id}/cancel_team_member_invite": null;
    "/projects/{project_id}/update_default_environment_variables": null;
    "/teams/{team_id}/create_custom_role": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["create custom role"]>
    >;
    "/teams/{team_id}/update_custom_role": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["update custom role"]>
    >;
    "/teams/{team_id}/delete_custom_role": null;
    "/teams/{team_id}/update_team_member_role": null;
  };
};

export const convexManagementResponseDecimalPaths: {
  GET: {
    "/projects/{project_id}": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/projects": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/list_deployments": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/deployment": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id_or_slug}/projects/{project_slug}/deployment": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id_or_slug}/projects/{project_slug}": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_deployment_classes": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_deployment_regions": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_deployments": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_local_deployments": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}/list_deploy_keys": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/list_preview_deploy_keys": readonly ConvexManagementResponseDecimalPath[];
    "/list_personal_access_tokens": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_access_tokens": readonly ConvexManagementResponseDecimalPath[];
    "/token_details": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}/custom_domains": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_members": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_audit_log_events": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_pending_invites": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/list_default_environment_variables": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/list_custom_roles": readonly ConvexManagementResponseDecimalPath[];
  };

  POST: {
    "/teams/{team_id}/create_project": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/delete": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/create_deployment": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}/delete": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}/transfer": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}/create_deploy_key": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}/delete_deploy_key": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/create_preview_deploy_key": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/delete_preview_deploy_key": readonly ConvexManagementResponseDecimalPath[];
    "/create_personal_access_token": readonly ConvexManagementResponseDecimalPath[];
    "/delete_personal_access_token": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/delete_access_token": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}/create_custom_domain": readonly ConvexManagementResponseDecimalPath[];
    "/deployments/{deployment_name}/delete_custom_domain": readonly ConvexManagementResponseDecimalPath[];
    "/teams/create_team": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/create_access_token": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/invite_team_member": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/cancel_team_member_invite": readonly ConvexManagementResponseDecimalPath[];
    "/projects/{project_id}/update_default_environment_variables": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/create_custom_role": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/update_custom_role": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/delete_custom_role": readonly ConvexManagementResponseDecimalPath[];
    "/teams/{team_id}/update_team_member_role": readonly ConvexManagementResponseDecimalPath[];
  };
};
