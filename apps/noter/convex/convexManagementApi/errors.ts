export class ConvexManagementApiError extends Error {
  readonly status: number;

  readonly path: string;

  readonly responseBodySummary: string;

  constructor(args: {
    status: number;
    path: string;
    responseBodySummary: string;
  }) {
    super(
      `Convex API request failed (${args.status}) for ${args.path}: ${args.responseBodySummary}`,
    );
    this.name = "ConvexManagementApiError";
    this.status = args.status;
    this.path = args.path;
    this.responseBodySummary = args.responseBodySummary;
  }
}

export class ConvexApiValidationError extends Error {
  readonly path: string;

  readonly schemaName: string;

  readonly validationErrors: readonly string[];

  constructor(args: {
    path: string;
    schemaName: string;
    validationErrors: readonly string[];
  }) {
    super(
      `Convex API response for ${args.path} did not match ${args.schemaName}: ${args.validationErrors.join("; ")}`,
    );
    this.name = "ConvexApiValidationError";
    this.path = args.path;
    this.schemaName = args.schemaName;
    this.validationErrors = args.validationErrors;
  }
}

export function isConvexManagementNotFoundError(error: unknown): boolean {
  return error instanceof ConvexManagementApiError && error.status === 404;
}
