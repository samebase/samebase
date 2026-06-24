import type {
  ArgsArrayForOptionalValidator,
  ArgsArrayToObject,
  DefaultArgsForOptionalValidator,
  DefaultFunctionArgs,
  FunctionVisibility,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
  ReturnValueForOptionalValidator,
} from "convex/server";
import type { GenericValidator, PropertyValidators } from "convex/values";

import type { AuthenticatedAccessKey, PublicAccessKey } from "./accessModel";

/*
Runtime access decisions stay in functions.ts. This file only describes the
type-level facade that makes a function definition's literal access policy
control the viewer type received by its handler.

Future middleware research starts here:
- Convex custom functions: https://stack.convex.dev/custom-functions
- Helper source: https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
- TanStack Start middleware: https://tanstack.com/start/v0/docs/framework/react/guide/middleware
- TanStack Router context: https://tanstack.com/router/v1/docs/guide/router-context
*/

export type AppAuthenticatedPolicy = {
  access: AuthenticatedAccessKey;
};

export type AppFunctionPolicy = { access: PublicAccessKey } | AppAuthenticatedPolicy;
type AppFunctionAccess = PublicAccessKey | AuthenticatedAccessKey;

type AppViewerForAccess<
  Access extends AppFunctionAccess,
  PublicViewer,
  AuthenticatedViewer,
> = Access extends PublicAccessKey ? PublicViewer : AuthenticatedViewer;

export type AppFunctionMcpMetadata = {
  name: string;
  description: string;
  safety: "read_only" | "write" | "destructive" | "proposal_only";
  inputDescriptions?: Record<string, string>;
};

type AppFunctionCtx<
  InputCtx,
  Access extends AppFunctionAccess,
  PublicViewer,
  AuthenticatedViewer,
> = Omit<InputCtx, "viewer"> & {
  viewer: AppViewerForAccess<Access, PublicViewer, AuthenticatedViewer>;
};

type AppFunctionDefinition<
  InputCtx,
  Access extends AppFunctionAccess,
  PublicViewer,
  AuthenticatedViewer,
  ArgsValidator extends PropertyValidators | GenericValidator | void,
  ReturnsValidator extends PropertyValidators | GenericValidator | void,
  ReturnValue extends ReturnValueForOptionalValidator<ReturnsValidator>,
  OneOrZeroArgs extends ArgsArrayForOptionalValidator<ArgsValidator>,
> = {
  access: Access;
  args?: ArgsValidator;
  returns?: ReturnsValidator;
  mcp?: AppFunctionMcpMetadata;
  handler: (
    ctx: AppFunctionCtx<InputCtx, Access, PublicViewer, AuthenticatedViewer>,
    ...args: OneOrZeroArgs
  ) => ReturnValue;
};

type AppFunctionRegistration<
  FuncType extends "query" | "mutation" | "action",
  Visibility extends FunctionVisibility,
  Args extends DefaultFunctionArgs,
  ReturnValue,
> = {
  query: RegisteredQuery<Visibility, Args, ReturnValue>;
  mutation: RegisteredMutation<Visibility, Args, ReturnValue>;
  action: RegisteredAction<Visibility, Args, ReturnValue>;
}[FuncType];

export type AppFunctionBuilder<
  FuncType extends "query" | "mutation" | "action",
  InputCtx,
  PublicViewer,
  AuthenticatedViewer,
> = <
  const Access extends AppFunctionAccess,
  ArgsValidator extends PropertyValidators | GenericValidator | void,
  ReturnsValidator extends PropertyValidators | GenericValidator | void,
  ReturnValue extends ReturnValueForOptionalValidator<ReturnsValidator> =
    ReturnValueForOptionalValidator<ReturnsValidator>,
  OneOrZeroArgs extends ArgsArrayForOptionalValidator<ArgsValidator> =
    DefaultArgsForOptionalValidator<ArgsValidator>,
>(
  definition: AppFunctionDefinition<
    InputCtx,
    Access,
    PublicViewer,
    AuthenticatedViewer,
    ArgsValidator,
    ReturnsValidator,
    ReturnValue,
    OneOrZeroArgs
  >,
) => AppFunctionRegistration<FuncType, "public", ArgsArrayToObject<OneOrZeroArgs>, ReturnValue>;
