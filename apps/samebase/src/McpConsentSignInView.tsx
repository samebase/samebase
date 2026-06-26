export function McpConsentSignInView() {
  return (
    <div className="container my-auto">
      <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-xl font-semibold tracking-tight">Sign in to continue</h2>
        <p className="text-sm text-muted-foreground">
          Use the account sidebar to sign in, then return here to approve the MCP request.
        </p>
      </div>
    </div>
  );
}
