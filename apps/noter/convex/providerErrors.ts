export function isProviderNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const status = Reflect.get(error, "status");
    if (typeof status === "number" && status === 404) {
      return true;
    }
    const response = Reflect.get(error, "response");
    if (typeof response === "object" && response !== null) {
      const responseStatus = Reflect.get(response, "status");
      if (typeof responseStatus === "number" && responseStatus === 404) {
        return true;
      }
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("(404)") ||
    message.includes("not found") ||
    message.includes("404")
  );
}
