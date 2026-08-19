import { Link } from "@tanstack/react-router";

export function PublicSignupLegalNotice() {
  return (
    <p className="max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
      {"By continuing, you agree to the "}
      <Link className="underline underline-offset-4" to="/terms">
        Terms of Service
      </Link>
      {". The "}
      <Link className="underline underline-offset-4" to="/privacy">
        Privacy Policy
      </Link>
      {" explains how Samebase uses your data."}
    </p>
  );
}
