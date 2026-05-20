// Generated from https://api.convex.dev/v1/openapi.json. Do not edit by hand.

import type {
  PlatformCreateDeployKeyResponse,
  PlatformCreateProjectResponse,
  PlatformDeploymentResponse,
  PlatformProjectDetails,
  PlatformTokenDetailsResponse,
} from "./convexManagementApiTypes.generated";
import type { ConvexOAuthTokenResponse } from "./convexManagementApi";

export type StandaloneValidationError = {
  instancePath: string;
  message?: string;
};

export type StandaloneValidateFunction<T> = {
  (payload: unknown): payload is T;
  errors: StandaloneValidationError[] | null;
};

export const vPlatformTokenDetailsResponse: StandaloneValidateFunction<PlatformTokenDetailsResponse>;
export const vPlatformProjectDetailsList: StandaloneValidateFunction<
  PlatformProjectDetails[]
>;
export const vPlatformCreateProjectResponse: StandaloneValidateFunction<PlatformCreateProjectResponse>;
export const vPlatformDeploymentResponse: StandaloneValidateFunction<PlatformDeploymentResponse>;
export const vPlatformDeploymentResponseList: StandaloneValidateFunction<
  PlatformDeploymentResponse[]
>;
export const vPlatformCreateDeployKeyResponse: StandaloneValidateFunction<PlatformCreateDeployKeyResponse>;
export const vConvexOAuthTokenResponse: StandaloneValidateFunction<ConvexOAuthTokenResponse>;
