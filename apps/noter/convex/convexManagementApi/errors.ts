export class ConvexManagementApiError extends Error {
  readonly status: number;

  readonly path: string;

  readonly responseBodySummary: string;

  constructor(args: { status: number; path: string; responseBodySummary: string }) {
    super(
      `Convex API request failed (${args.status}) for ${args.path}: ${args.responseBodySummary}`,
    );
    this.name = "ConvexManagementApiError";
    this.status = args.status;
    this.path = args.path;
    this.responseBodySummary = args.responseBodySummary;
  }
}

export function isConvexManagementNotFoundError(error: unknown): boolean {
  return error instanceof ConvexManagementApiError && error.status === 404;
}
