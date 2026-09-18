// Generated from https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json. Do not edit by hand.

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

export const cloudflareApiResponseValidators: {
  DELETE: {
    "/accounts/{account_id}/builds/repos/connections/{repo_connection_uuid}": null;
    "/accounts/{account_id}/builds/tokens/{build_token_uuid}": null;
    "/accounts/{account_id}/builds/triggers/{trigger_uuid}": null;
    "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables/{environment_variable_key}": null;
    "/accounts/{account_id}/builds/workers/{script_name}/deploy_hooks/{deploy_hook_uuid}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["deleteDeployHook"]>
    >;
    "/accounts/{account_id}/builds/workers/{script_tag}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["deleteWorkerBuild"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-delete-namespace"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-delete-scripts"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-script-delete-worker"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/secrets/{secret_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-delete-script-secret"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/tags/{tag}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-delete-script-tag"]>
    >;
    "/accounts/{account_id}/workers/domains/{domain_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["workers.domains.delete"]>
    >;
    "/accounts/{account_id}/workers/observability/destinations/{slug}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["destinations.delete"]>
    >;
    "/accounts/{account_id}/workers/observability/queries/{queryId}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["queries.delete"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-delete-worker"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/deployments/{deployment_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-deployments-delete-deployment"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/secrets/{secret_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-delete-script-secret"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/subdomain": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-delete-subdomain"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/tails/{id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-tail-logs-delete-tail"]>
    >;
    "/accounts/{account_id}/workers/subdomain": null;
    "/accounts/{account_id}/workers/workers/{worker_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["deleteWorker"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["deleteWorkerVersion"]>
    >;
  };

  GET: {
    "/accounts": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["accounts-list-accounts"]>
    >;
    "/accounts/{account_id}/builds/account/limits": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getAccountLimits"]>
    >;
    "/accounts/{account_id}/builds/builds": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getBuildsByVersionIds"]>
    >;
    "/accounts/{account_id}/builds/builds/{build_uuid}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getBuildByUuid"]>
    >;
    "/accounts/{account_id}/builds/builds/{build_uuid}/logs": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getBuildLogs"]>
    >;
    "/accounts/{account_id}/builds/builds/latest": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getLatestBuildsByScripts"]>
    >;
    "/accounts/{account_id}/builds/repos/{provider_type}/{provider_account_id}/{repo_id}/config_autofill": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getWorkerConfigAutofill"]>
    >;
    "/accounts/{account_id}/builds/tokens": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["listBuildTokens"]>
    >;
    "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["listEnvironmentVariables"]>
    >;
    "/accounts/{account_id}/builds/workers/{external_script_id}/builds": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["listBuildsByScript"]>
    >;
    "/accounts/{account_id}/builds/workers/{external_script_id}/triggers": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["listTriggersByScript"]>
    >;
    "/accounts/{account_id}/builds/workers/{script_name}/deploy_hooks": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["listDeployHooks"]>
    >;
    "/accounts/{account_id}/builds/workers/{script_name}/deploy_hooks/{deploy_hook_uuid}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getDeployHook"]>
    >;
    "/accounts/{account_id}/builds/workers/{script_tag}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getWorkerBuild"]>
    >;
    "/accounts/{account_id}/workers/account-settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-account-settings-fetch-worker-account-settings"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-list"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-get-namespace"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-list-scripts"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-script-worker-details"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/bindings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-get-script-bindings"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/content": null;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/secrets": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-list-script-secrets"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/secrets/{secret_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-get-script-secrets"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-get-script-settings"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/tags": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-get-script-tags"]>
    >;
    "/accounts/{account_id}/workers/domains": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["workers.domains.list"]>
    >;
    "/accounts/{account_id}/workers/domains/{domain_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["workers.domains.get"]>
    >;
    "/accounts/{account_id}/workers/durable_objects/namespaces": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["durable-objects-namespace-list-namespaces"]>
    >;
    "/accounts/{account_id}/workers/durable_objects/namespaces/{id}/objects": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["durable-objects-namespace-list-objects"]>
    >;
    "/accounts/{account_id}/workers/observability/destinations": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["destination.list"]>
    >;
    "/accounts/{account_id}/workers/observability/metricsexport": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["metricsExport.list"]>
    >;
    "/accounts/{account_id}/workers/observability/queries": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["queries.list"]>
    >;
    "/accounts/{account_id}/workers/observability/queries/{queryId}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["queries.get"]>
    >;
    "/accounts/{account_id}/workers/observability/shared/query/{id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["shared.query.get"]>
    >;
    "/accounts/{account_id}/workers/observability/usage": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["usage.get"]>
    >;
    "/accounts/{account_id}/workers/observability/zones/{zone_id}/observability/tracing/rules": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["zone.observability.tracing.rules.get"]>
    >;
    "/accounts/{account_id}/workers/observability/zones/{zone_id}/observability/tracing/settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["zone.observability.tracing.settings.get"]>
    >;
    "/accounts/{account_id}/workers/placement/regions": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-placement-list-regions"]>
    >;
    "/accounts/{account_id}/workers/scripts": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-list-workers"]>
    >;
    "/accounts/{account_id}/workers/scripts-search": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-search-workers"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}": null;
    "/accounts/{account_id}/workers/scripts/{script_name}/content/v2": null;
    "/accounts/{account_id}/workers/scripts/{script_name}/deployments": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-deployments-list-deployments"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/deployments/{deployment_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-deployments-get-deployment"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/schedules": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-cron-trigger-get-cron-triggers"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/script-settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-settings-get-settings"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/secrets": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-list-script-secrets"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/secrets/{secret_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-get-script-secret"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-get-settings"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/subdomain": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-get-subdomain"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/tails": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-tail-logs-list-tails"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/usage-model": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-fetch-usage-model"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/versions": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-versions-list-versions"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/versions/{version_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-versions-get-version-detail"]>
    >;
    "/accounts/{account_id}/workers/services/{service_name}/environments/{environment_name}/content": null;
    "/accounts/{account_id}/workers/services/{service_name}/environments/{environment_name}/settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-environment-get-settings"]>
    >;
    "/accounts/{account_id}/workers/subdomain": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-subdomain-get-subdomain"]>
    >;
    "/accounts/{account_id}/workers/workers": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["listWorkers"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getWorker"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}/versions": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["listWorkerVersions"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getWorkerVersion"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}/versions/latest": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["getLatestWorkerVersion"]>
    >;
    "/user/tokens/verify": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["user-api-tokens-verify-token"]>
    >;
  };

  PATCH: {
    "/accounts/{account_id}/builds/triggers/{trigger_uuid}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["updateTrigger"]>
    >;
    "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["upsertEnvironmentVariables"]>
    >;
    "/accounts/{account_id}/builds/workers/{script_tag}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["updateWorkerBuild"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-patch-namespace"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/secrets-bulk": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-patch-script-secrets-bulk"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-patch-script-settings"]>
    >;
    "/accounts/{account_id}/workers/observability/destinations/{slug}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["destination.update"]>
    >;
    "/accounts/{account_id}/workers/observability/queries/{queryId}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["queries.patch"]>
    >;
    "/accounts/{account_id}/workers/observability/zones/{zone_id}/observability/tracing/settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["zone.observability.tracing.settings.update"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/script-settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-settings-patch-settings"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/secrets-bulk": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-patch-script-secrets-bulk"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-patch-settings"]>
    >;
    "/accounts/{account_id}/workers/services/{service_name}/environments/{environment_name}/settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-environment-patch-settings"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["editWorker"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}/versions/latest": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["patchLatestWorkerVersion"]>
    >;
  };

  POST: {
    "/accounts": AjvStandaloneValidateFunction<SuccessResponseJSON<operations["account-creation"]>>;
    "/accounts/{account_id}/builds/tokens": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["createBuildToken"]>
    >;
    "/accounts/{account_id}/builds/triggers": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["createTrigger"]>
    >;
    "/accounts/{account_id}/builds/triggers/{trigger_uuid}/builds": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["createManualBuild"]>
    >;
    "/accounts/{account_id}/builds/triggers/{trigger_uuid}/purge_build_cache": null;
    "/accounts/{account_id}/builds/workers": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["createWorkerBuild"]>
    >;
    "/accounts/{account_id}/builds/workers/{script_name}/deploy_hooks": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["createDeployHook"]>
    >;
    "/accounts/{account_id}/workers/assets/upload": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-assets-upload"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-create"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/assets-upload-session": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-script-update-create-assets-upload-session"]>
    >;
    "/accounts/{account_id}/workers/observability/destinations": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["destination.create"]>
    >;
    "/accounts/{account_id}/workers/observability/metricsexport": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["metricsExport.upsert"]>
    >;
    "/accounts/{account_id}/workers/observability/queries": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["queries.post"]>
    >;
    "/accounts/{account_id}/workers/observability/shared/query": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["shared.query.post"]>
    >;
    "/accounts/{account_id}/workers/observability/telemetry/keys": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["telemetry.keys.list"]>
    >;
    "/accounts/{account_id}/workers/observability/telemetry/live-tail": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["telemetry.live-tail.post"]>
    >;
    "/accounts/{account_id}/workers/observability/telemetry/live-tail/heartbeat": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["telemetry.live-tail.heartbeat.get"]>
    >;
    "/accounts/{account_id}/workers/observability/telemetry/query": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["telemetry.query"]>
    >;
    "/accounts/{account_id}/workers/observability/telemetry/values": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["telemetry.values.list"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/assets-upload-session": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-update-create-assets-upload-session"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/deployments": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-deployments-create-deployment"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/subdomain": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-post-subdomain"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/tails": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-tail-logs-start-tail"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/versions": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-versions-upload-version"]>
    >;
    "/accounts/{account_id}/workers/workers": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["createWorker"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}/versions": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["createWorkerVersion"]>
    >;
  };

  PUT: {
    "/accounts/{account_id}/builds/builds/{build_uuid}/cancel": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["cancelBuildByUuid"]>
    >;
    "/accounts/{account_id}/builds/repos/connections": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["upsertRepoConnection"]>
    >;
    "/accounts/{account_id}/builds/workers/{script_name}/deploy_hooks/{deploy_hook_uuid}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["updateDeployHook"]>
    >;
    "/accounts/{account_id}/workers/account-settings": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-account-settings-create-worker-account-settings"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-put-namespace"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}": null;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/content": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-put-script-content"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/secrets": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-put-script-secrets"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/tags": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-put-script-tags"]>
    >;
    "/accounts/{account_id}/workers/dispatch/namespaces/{dispatch_namespace}/scripts/{script_name}/tags/{tag}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["namespace-worker-put-script-tag"]>
    >;
    "/accounts/{account_id}/workers/domains": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["workers.domains.update"]>
    >;
    "/accounts/{account_id}/workers/observability/zones/{zone_id}/observability/tracing/rules": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["zone.observability.tracing.rules.update"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-upload-worker-module"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/content": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-put-content"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/schedules": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-cron-trigger-update-cron-triggers"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/secrets": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-put-script-secret"]>
    >;
    "/accounts/{account_id}/workers/scripts/{script_name}/usage-model": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-script-update-usage-model"]>
    >;
    "/accounts/{account_id}/workers/services/{service_name}/environments/{environment_name}/content": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-environment-put-script-content"]>
    >;
    "/accounts/{account_id}/workers/subdomain": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["worker-subdomain-create-subdomain"]>
    >;
    "/accounts/{account_id}/workers/workers/{worker_id}": AjvStandaloneValidateFunction<
      SuccessResponseJSON<operations["updateWorker"]>
    >;
  };
};
