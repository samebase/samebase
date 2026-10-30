# Licensing

A folder's own license replaces the root license for that folder.

| Folder                                                                                                                   | License                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `apps/samebase`, and every folder that this table does not list                                                          | [AGPL-3.0-only](LICENSE)                                                           |
| `packages/dependent`, `packages/git-editor`, `packages/logo-model`, `packages/onboarding-video-tools`, `packages/plugin` | Apache-2.0, in the folder's `LICENSE`                                              |
| `packages/identity-broker`, `apps/identity-hub`                                                                          | Apache-2.0, in the folder's `LICENSE`                                              |
| `templates/base`, `templates/base-actions`                                                                               | Apache-2.0, in the folder's `LICENSE`                                              |
| `packages/sidebars`, `packages/sure`, `apps/sidebars-example`                                                            | MIT, in the folder's `LICENSE.md`                                                  |
| `apps/remotion-studio`                                                                                                   | All rights reserved, in the folder's [LICENSE.md](apps/remotion-studio/LICENSE.md) |

Copyright (c) 2026 Nicușor Chiciuc, unless a file says otherwise. No license in this repository
grants rights to the Samebase name or logo.

`apps/remotion-studio` is not open source because it holds personal recordings and depends on
Remotion, which has its own license.

## Third-party dependencies

Each dependency stays under its own license.

- Reviewed on 2026-10-30 with `pnpm licenses list --prod` in `apps/samebase`: 589 packages under 15
  licenses.
- The review found no GPL, AGPL, LGPL, or source-available dependency.
- `dompurify` is offered under `MPL-2.0 OR Apache-2.0`. Use the Apache-2.0 option.
- `lightningcss` is MPL-2.0, which is compatible with AGPL-3.0. Keep its license notices.
- `apps/remotion-studio` uses the Remotion packages and `mediabunny`. Check their current terms
  before you redistribute that folder or upgrade those versions.

If you distribute built artifacts, keep the copyright and license notices of the third-party code in
them.
