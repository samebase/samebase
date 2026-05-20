// Generated from https://api.convex.dev/v1/openapi.json. Do not edit by hand.

import type {
  PlatformCreateDeployKeyResponse,
  PlatformCreateProjectResponse,
  PlatformDeploymentResponse,
  PlatformProjectDetails,
  PlatformTokenDetailsResponse,
} from "./convexManagementApiTypes.generated";
import type { ConvexOAuthTokenResponse } from "./convexManagementApi";

export type AjvStandaloneValidationError = {
  instancePath: string;
  keyword?: string;
  message?: string;
  params?: unknown;
};

export type AjvStandaloneValidateFunction<T> = {
  (payload: unknown): payload is T;
  errors: AjvStandaloneValidationError[] | null;
};

export const ajvPlatformTokenDetailsResponse: AjvStandaloneValidateFunction<PlatformTokenDetailsResponse>;
export const ajvPlatformProjectDetailsList: AjvStandaloneValidateFunction<
  PlatformProjectDetails[]
>;
export const ajvPlatformCreateProjectResponse: AjvStandaloneValidateFunction<PlatformCreateProjectResponse>;
export const ajvPlatformDeploymentResponse: AjvStandaloneValidateFunction<PlatformDeploymentResponse>;
export const ajvPlatformDeploymentResponseList: AjvStandaloneValidateFunction<
  PlatformDeploymentResponse[]
>;
export const ajvPlatformCreateDeployKeyResponse: AjvStandaloneValidateFunction<PlatformCreateDeployKeyResponse>;
export const ajvConvexOAuthTokenResponse: AjvStandaloneValidateFunction<ConvexOAuthTokenResponse>;
