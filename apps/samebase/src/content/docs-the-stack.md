# The stack

What [samebase/base](https://github.com/samebase/base) ships. Each piece is the smallest choice that
still holds when a weekend app turns into a product.

- **Alchemy deploys.** One `alchemy.run.ts` describes the app. GitHub Actions runs it: `main` to
  production, each pull request to its own preview. The state lives in your Convex team.
- **Convex is the backend and the host.** Data is reachable only through functions you write, and
  [convex-hosting](https://github.com/samebase/convex-hosting) serves the site from the same
  deployment.
- **TanStack Start renders the pages,** on the server too, with React.
- **Vite+ is the one command** for dev, tests, lint, format, and build. Scripts are TypeScript run
  by Node 24, so the repository works on macOS, Linux, and Windows without Bash.
- **Tailwind and shadcn/ui** keep the styles next to the markup your agent edits.
- **Everything is typed,** from the schema to route params. The compiler catches an agent's mistake
  before it ships.

Cloudflare is optional. Declare a Worker in `alchemy.run.ts` when the app needs one.

Build it by hand with [Do it yourself](/docs/do-it-yourself), or check each claim in
[Receipts](/docs/receipts).
