import { getFunctionAddress } from "convex/server";
import { z } from "zod";

/** Convex 1.46.0 private reference encoding. Generated child roots are relative to their parent. */
export function componentPath(reference: unknown, parent: string[] = []) {
  const address = z
    .object({ reference: z.string().regex(/^_reference\/childComponent\/[A-Za-z_][A-Za-z0-9_]*$/) })
    .parse(getFunctionAddress(reference));
  return [...parent, address.reference.slice("_reference/childComponent/".length)];
}
