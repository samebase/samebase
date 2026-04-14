import { PasswordAuthForm } from "@/SignInForm";

export function PasswordAuthVisualFixture() {
  return (
    <div
      data-testid="password-auth-visual-fixture"
      className="min-h-screen bg-stone-100 p-8 text-stone-950"
    >
      <div className="mx-auto grid max-w-4xl gap-6">
        <header className="grid gap-2 border border-stone-300 bg-white p-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Password Auth Visual Fixture
          </h1>
          <p className="max-w-3xl text-sm text-stone-600">
            Visual coverage for the shipped password-auth surfaces used by
            preview deployments and local worktrees.
          </p>
        </header>

        <section className="grid gap-3 border border-stone-300 bg-white p-5">
          <div className="grid gap-1">
            <h2 className="text-sm font-semibold text-stone-900">
              Preview password sign-in
            </h2>
            <p className="text-xs text-stone-600">
              Preview deployments show sign-in only and hide local worktree
              shortcuts.
            </p>
          </div>
          <div data-testid="password-auth-visual-preview" className="max-w-md">
            <PasswordAuthForm surface="preview" />
          </div>
        </section>

        <section className="grid gap-3 border border-stone-300 bg-white p-5">
          <div className="grid gap-1">
            <h2 className="text-sm font-semibold text-stone-900">
              Local worktree password auth
            </h2>
            <p className="text-xs text-stone-600">
              Local worktrees still expose the account toggle and autofill
              shortcut for the seeded local credential.
            </p>
          </div>
          <div
            data-testid="password-auth-visual-local-worktree"
            className="max-w-md"
          >
            <PasswordAuthForm surface="local_worktree" />
          </div>
        </section>
      </div>
    </div>
  );
}
