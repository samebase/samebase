import { useMutation } from "convex/react";
import { FunctionReference } from "convex/server";
import { useState, useCallback } from "react";

export type GetFunctionReferenceReturnType<
  T extends FunctionReference<any, any, any, any>,
> = T["_returnType"];

// Convex useMutation wrapper that also returns the state (e.g. 'loading')
export function useConvexMutation<T extends FunctionReference<"mutation">>(
  mutation: T,
) {
  const [state, setState] = useState<"idle" | "loading">("idle");
  const rawMutation = useMutation(mutation);

  const wrappedMutation = useCallback(
    async (
      ...args: Parameters<typeof rawMutation>
    ): ReturnType<typeof rawMutation> => {
      setState("loading");
      try {
        const result = await rawMutation(...args);
        setState("idle");
        return result;
      } catch (error) {
        setState("idle");
        throw error;
      }
    },
    [rawMutation],
  );

  return [wrappedMutation, state] as const;
}
