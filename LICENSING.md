# Licensing

A folder's own license replaces the root license for that folder.

| Folder                                                                                                                   | License                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `apps/samebase`, and every folder that this table does not list                                                          | [FSL-1.1-ALv2](LICENSE)                                                            |
| `packages/dependent`, `packages/git-editor`, `packages/logo-model`, `packages/onboarding-video-tools`, `packages/plugin` | Apache-2.0, in the folder's `LICENSE`                                              |
| `packages/identity-broker`, `apps/identity-hub`, `apps/identity-broker-explainer`                                        | Apache-2.0, in the folder's `LICENSE`                                              |
| `packages/sidebars`, `packages/sure`, `apps/sidebars-example`                                                            | MIT, in the folder's `LICENSE.md`                                                  |
| `apps/remotion-studio`                                                                                                   | All rights reserved, in the folder's [LICENSE.md](apps/remotion-studio/LICENSE.md) |

Copyright (c) 2026 Nicușor Chiciuc, unless a file says otherwise. No license in this repository
grants rights to the Samebase name or logo.

`apps/samebase` is Fair Source, not open source. The Functional Source License allows any use,
including running your own copy, except making the software available to others in a commercial
product or service that competes with Samebase. Each version becomes Apache-2.0 two years after its
release. Versions published before this change stay under AGPL-3.0-only.

`apps/remotion-studio` is not open source because it holds personal recordings and depends on
Remotion, which has its own license.

## Third-party dependencies

Each dependency stays under its own license.

- Reviewed on 2026-10-30 with `pnpm licenses list --prod` in `apps/samebase`: 589 packages under 15
  licenses.
- The review found no GPL, AGPL, LGPL, or source-available dependency.
- `dompurify` is offered under `MPL-2.0 OR Apache-2.0`. Use the Apache-2.0 option.
- `lightningcss` is MPL-2.0. Keep its license notices.
- `apps/remotion-studio` uses the Remotion packages and `mediabunny`. Check their current terms
  before you redistribute that folder or upgrade those versions.

If you distribute built artifacts, keep the copyright and license notices of the third-party code in
them.
