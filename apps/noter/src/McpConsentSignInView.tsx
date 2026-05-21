import { SignInForm } from "./SignInForm";

export function McpConsentSignInNotice() {
  return (
    <div className="rounded-md border px-3 py-3 text-sm">
      <p className="font-medium">Temporary MCP sign-in note</p>
      <p className="mt-1 text-muted-foreground">
        This flow currently works best if you are already signed in to Noter in this same browser
        before you click Authenticate in Codex.
      </p>
      <p className="mt-1 text-muted-foreground">
        If you are not signed in yet, sign in here first. If Codex does not continue afterward, go
        back and press Authenticate again.
      </p>
    </div>
  );
}

export function McpConsentSignInView() {
  return <SignInForm topNotice={<McpConsentSignInNotice />} />;
}
