# Licensing Notes

This repository's own code is proprietary and marked `UNLICENSED` in package metadata. That does not
change the license of any third-party dependency.

Current dependency review:

- Reviewed on 2026-07-26 using `pnpm licenses list --prod`.
- Raw report stored at `docs/compliance/licenses-prod-2026-07-26.txt`.
- Lockfile snapshot: `pnpm-lock.yaml` SHA-256
  `9e0999dc364996cd180ef716b26ba57b06a4ccab991abe26a1f8c7e4006f8360`.

- `pnpm licenses list --prod` did not surface GPL, AGPL, or LGPL dependencies.
- The production dependency graph is dominated by permissive licenses, especially MIT and
  Apache-2.0.
- `@prosemark/core` is MIT licensed.
- `convex` is Apache-2.0 licensed.
- `dompurify` is offered under `MPL-2.0 OR Apache-2.0`; use the Apache-2.0 option.
- `@polar-sh/sdk` omits a `license` field in the published package metadata, but its published
  README currently advertises MIT. Re-verify that package on version upgrades.

Practical implication:

- You can keep Noter proprietary while using these dependencies.
- If you distribute built artifacts or otherwise redistribute third-party code, you still need to
  preserve the applicable third-party copyright and license notices for those components.
- If you later want selected people to access the source code, do that through private repository
  access plus separate written permission, or replace this license with a deliberate
  source-available/commercial license.
