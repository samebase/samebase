import { Link } from "@tanstack/react-router";

export function PublicOAuthReturnNotice() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-medium">Sign-in was not completed.</p>
      <Link className="text-base underline underline-offset-4" to="/">
        Try again
      </Link>
    </div>
  );
}
