import { FunctionReference } from "convex/server";

export type GetFunctionReferenceReturnType<
  T extends FunctionReference<any, any, any, any>,
> = T["_returnType"];
