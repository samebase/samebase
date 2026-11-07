#!/usr/bin/env bash
# Rebuilds old/ and versions/ from git. Reads this repository, plus a samebase/identity-broker clone
# (IDENTITY_BROKER_REPO, default ../identity-broker next to this repository) for the 0.9.0 broker fix.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mono="$(git -C "$here" rev-parse --show-toplevel)"; broker="${IDENTITY_BROKER_REPO:-$mono/../identity-broker}"
git -C "$mono" fetch -q origin main
rm -rf "$here/versions"; mkdir -p "$here/versions" "$here/old"
extract() { local label="$1" rev="$2"; shift 2; mkdir -p "$here/versions/$label"; git -C "$mono" archive "$rev" "$@" | tar -x -C "$here/versions/$label"; }
noter=(apps/noter/convex apps/noter/shared); sb=(apps/samebase/convex apps/samebase/shared packages/dependent)
extract v1-before-d6e75127a "d6e75127a^" "${noter[@]}"
extract v2-d6e75127a d6e75127a "${noter[@]}"
extract v3-d18b1c286 d18b1c286 "${noter[@]}"
extract v4-51432b848 51432b848 "${noter[@]}"
extract v5-before-c7a9fd65e "c7a9fd65e^" "${sb[@]}"
extract v6-c7a9fd65e c7a9fd65e "${sb[@]}"
extract v7-before-7ceb8f30c "7ceb8f30c^" "${sb[@]}"
extract v8-7ceb8f30c 7ceb8f30c "${sb[@]}"
extract v7m-before-3e3b443ae "3e3b443ae^" "${sb[@]}"
extract v8m-3e3b443ae 3e3b443ae packages/git-editor/src
extract v9-main origin/main packages/git-editor/src
geometry() { git -C "$mono" show "$1:apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2Geometry.ts" | sed \
  -e 's#^import { clampNumber } from "@/lib/clampNumber";#function clampNumber(v: number, a: number, b: number) { return Math.max(a, Math.min(v, b)); }#' \
  -e 's#^import { MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX } from "@/lib/workspacePaneSizes";#const MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX = 40;#' \
  -e 's#^import type { WorkspaceMobileSurface } from .*#type WorkspaceMobileSurface = any;#'; }
geometry "a9d09423a^" > "$here/old/geometry-before-a9d09423a.ts"
geometry a9d09423a > "$here/old/geometry-at-a9d09423a.ts"
git -C "$mono" show origin/main:packages/git-editor/src/component/collaborativeText.ts > "$here/old/collaborativeText-main.ts"
git -C "$broker" show "bc8a2a9^:packages/identity-broker/src/client/protocol.ts" > "$here/old/broker-protocol-before-bc8a2a9.ts"
git -C "$broker" show "bc8a2a9^:packages/identity-broker/src/client/responses.ts" > "$here/old/broker-responses-before-bc8a2a9.ts"
git -C "$mono" show origin/main:packages/identity-broker/src/client/protocol.ts > "$here/old/broker-protocol-main.ts"
git -C "$mono" show origin/main:packages/identity-broker/src/client/responses.ts > "$here/old/broker-responses-main.ts"
echo "extracted into $here/versions and $here/old"
