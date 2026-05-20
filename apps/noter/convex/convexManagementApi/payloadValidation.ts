import {
  type AjvStandaloneValidateFunction,
  type AjvStandaloneValidationError,
} from "./validators.generated";
import { ConvexApiValidationError } from "./errors";

export function validatePayload<T>(args: {
  path: string;
  schemaName: string;
  validator: AjvStandaloneValidateFunction<T>;
  payload: unknown;
}): T {
  if (args.validator(args.payload)) {
    return args.payload;
  }

  throw new ConvexApiValidationError({
    path: args.path,
    schemaName: args.schemaName,
    validationErrors: formatValidationErrors(args.validator.errors),
  });
}

function formatValidationErrors(
  errors: AjvStandaloneValidationError[] | null | undefined,
): string[] {
  if (!errors || errors.length === 0) {
    return ["unknown validation error"];
  }
  return errors.map((error) => {
    const path = error.instancePath.length > 0 ? error.instancePath : "/";
    const message = error.message ?? "failed validation";
    return `${path} ${message}`;
  });
}
