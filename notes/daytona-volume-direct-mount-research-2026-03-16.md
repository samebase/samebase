# Daytona volume direct-mount research

Date: 2026-03-16

## Goal

Capture the relevant research for a future Daytona PR that makes direct volume
mounts behave correctly for sandbox users, with a focus on mounting a writable
shared Codex home without app-side sync workarounds.

## Executive summary

Daytona volumes are not ordinary Docker-managed local volumes. In the current
open source implementation, Daytona mounts an S3-backed FUSE filesystem on the
runner host with `mount-s3`, then bind-mounts that host path into the sandbox
container.

That detail matters because the sandbox `user` setting does not control the
ownership of the mounted volume. Today, Daytona exposes only `volumeId`,
`mountPath`, and optional `subpath` for volume mounts, so there is no user- or
ownership-aware mount configuration at the API or SDK layer.

The good news is that the underlying `mount-s3` tool already supports `--uid`
and `--gid`. So a Daytona fix likely does not require a brand-new storage model.
The likely fix is in the runner mount path: Daytona needs to resolve the target
sandbox user's numeric UID/GID and pass those values when it invokes `mount-s3`.

## Why this matters for Noter

Noter wants to mount shared Codex state directly into the Daytona sandbox,
ideally at a path like `/home/daytona/.codex` or a backing shared location used
by Codex.

The direct-mount model is the right conceptual model. The current friction comes
from the mount implementation, not from the idea of direct mounts. When the
mounted filesystem does not present writable ownership semantics that match the
sandbox user, user-space tools that expect a normal home directory can fail on
metadata-sensitive operations like config persistence.

## Noter-side context

In Noter, the current sandbox creation code already does the obvious thing:

- it sets the sandbox OS user to `daytona`
- it mounts a Daytona volume at the requested absolute path

Relevant local references:

- `apps/noter/convex/daytona/actions.ts`
- `node_modules/.pnpm/@daytonaio+sdk@0.143.0_ws@8.19.0/node_modules/@daytonaio/sdk/src/Daytona.d.ts`

The installed SDK type confirms that `VolumeMount` exposes only:

- `volumeId`
- `mountPath`

There is no ownership or mount-options surface in the installed TypeScript SDK.

## Daytona source inspected

Repository examined:

- `https://github.com/daytonaio/daytona`

Local checkout used for inspection:

- `/tmp/daytona-src-2wL9z7`

Commit inspected:

- `5ff2aa4422fa82b44fc4a7d335f5f150042f829c`

## Confirmed findings

### 1. Daytona documents volumes as FUSE mounts backed by S3-compatible storage

Source:

- `apps/docs/src/content/docs/en/volumes.mdx`

The docs explicitly describe volumes as FUSE-based mounts with data stored in an
S3-compatible object store.

Implication:

- volume behavior should be analyzed as host-mounted FUSE storage, not as a
  normal Docker local volume

### 2. Volume mount DTOs do not expose ownership fields

Sources:

- `apps/api/src/sandbox/dto/sandbox.dto.ts`
- `libs/sdk-typescript/src/Daytona.ts`

The current sandbox volume shape is effectively:

- `volumeId`
- `mountPath`
- optional `subpath`

There is no API or SDK field for:

- `uid`
- `gid`
- `mode`
- arbitrary mount flags

Implication:

- there is currently no app-level way to ask Daytona to mount a volume as the
  sandbox user

### 3. Daytona mounts volumes on the runner host with `mount-s3`

Source:

- `apps/runner/pkg/docker/volumes_mountpaths.go`

The runner:

- chooses a host mount base under `/tmp` in development or `/mnt` otherwise
- creates a host directory for the volume mount
- runs `mount-s3`
- waits for the FUSE mount to become ready
- returns a bind string for Docker

The current `mount-s3` invocation uses:

- `--allow-other`
- `--allow-delete`
- `--allow-overwrite`
- `--file-mode 0666`
- `--dir-mode 0777`
- optional `--prefix <subpath>/`

Implications:

- Daytona is already controlling Mountpoint flags centrally in the runner
- Daytona is not currently passing `--uid` or `--gid`
- broad mode bits are being used instead of user-specific ownership mapping

### 4. The sandbox container receives the mount through Docker bind-mounts

Source:

- `apps/runner/pkg/docker/container_configs.go`

The runner appends the host-side mounted path to Docker `Binds` for the
container host config.

Implication:

- the bind-mounted filesystem appears inside the container after the host-side
  FUSE mount is already established
- sandbox process identity does not retroactively determine mount ownership

### 5. Runner currently receives only the sandbox username string

Sources:

- `apps/runner/pkg/api/dto/sandbox.go`
- `apps/runner/pkg/docker/container_configs.go`

The runner receives `OsUser` and exports it as `DAYTONA_SANDBOX_USER`, but the
container config path inspected here does not set a Docker `User` field and the
volume mount path does not resolve numeric UID/GID before calling `mount-s3`.

Implication:

- even if Daytona knows the sandbox username, the runner still needs a strategy
  to derive numeric ownership for the host-side mount

## Mountpoint for S3 findings

Repository examined:

- `https://github.com/awslabs/mountpoint-s3`

Local checkout used for inspection:

- `/tmp/mountpoint-s3-src-EsGZhq`

## Confirmed Mountpoint capabilities

Sources:

- `mountpoint-s3/src/cli.rs`
- `doc/CONFIGURATION.md`
- `doc/SEMANTICS.md`

Mountpoint already supports:

- `--uid`
- `--gid`
- `--file-mode`
- `--dir-mode`
- `--allow-other`
- `--allow-root`
- `--prefix`

Important semantics from the docs:

- ownership and mode are assigned at mount startup time
- `chmod` and `chown` do not change those values after mount
- other users cannot access the mount by default unless `--allow-other` or
  `--allow-root` is used

Implications:

- Daytona can likely solve the ownership issue at mount creation time
- this does not appear to require replacing `mount-s3`
- a fix should happen before the bind-mount is handed to the sandbox

## Likely Daytona PR surface

The most likely implementation point is:

- `apps/runner/pkg/docker/volumes_mountpaths.go`

Possible related files:

- `apps/runner/pkg/api/dto/sandbox.go`
- `apps/api/src/sandbox/dto/sandbox.dto.ts`
- `apps/api/src/sandbox/managers/sandbox-actions/sandbox-start.action.ts`
- `libs/sdk-typescript/src/Daytona.ts`
- `apps/docs/src/content/docs/en/volumes.mdx`

## Most likely fix direction

### Option A: derive UID/GID from sandbox user in the runner

This is the cleanest path if Daytona can reliably determine the numeric UID/GID
for the sandbox user before calling `mount-s3`.

High-level shape:

1. Resolve sandbox user numeric UID/GID.
2. Add `--uid <uid>` and `--gid <gid>` to the `mount-s3` invocation.
3. Keep or adjust `--file-mode` and `--dir-mode` as needed.
4. Preserve `--allow-other` only if cross-user access is intentionally desired.

Pros:

- no app-side sync workaround
- minimal conceptual change
- keeps direct mount semantics

Open design question:

- where should the runner get the numeric UID/GID from

### Option B: expose ownership explicitly in the API/SDK

If Daytona cannot reliably infer numeric IDs from the sandbox definition, it may
need an explicit API surface such as mount ownership or mount options.

Pros:

- explicit and flexible

Cons:

- larger API surface
- less ergonomic for common cases
- pushes low-level filesystem details into the public API

### Preferred direction

Option A looks better if feasible. Mountpoint already supports the needed flags,
and Daytona already centralizes mount creation in the runner. The simplest user
experience is still:

- choose sandbox user
- mount volume
- have the mount behave like that user's filesystem view

## Open questions that a PR needs to answer

### 1. How should Daytona resolve numeric UID/GID?

Possibilities:

- inspect the target image before container start
- start the container, query `id -u` and `id -g` for the sandbox user, then
  mount and bind
- standardize expected UID/GID for Daytona-managed base images
- add explicit UID/GID to sandbox metadata

This is the main unresolved implementation question.

### 2. Should Daytona keep `--allow-other` by default?

Mountpoint docs make it clear that `--allow-other` is what permits access by
users other than the mounting user. If Daytona starts passing `--uid` and
`--gid`, it should re-evaluate whether `--allow-other` is still the right
default for security and predictability.

### 3. Are current `0666` and `0777` modes too permissive?

Daytona currently uses:

- `--file-mode 0666`
- `--dir-mode 0777`

That may be intentional to avoid obvious permission denials, but it also hides
the ownership problem behind permissive mode bits. A PR should decide whether
these defaults should be tightened once UID/GID are set correctly.

### 4. Does Daytona need compatibility behavior for existing consumers?

If existing users depend on broad cross-user accessibility, changing default
ownership behavior may have compatibility impact. This needs to be assessed.

## Suggested validation plan for a Daytona PR

### Core filesystem checks

In a sandbox with user `daytona` and a mounted volume:

1. Run `id -u` and `id -g`.
2. Run `stat` on the mounted directory and a test file.
3. Confirm ownership matches the sandbox user's numeric IDs.
4. Confirm normal file create, write, rename, and delete all work.

### Metadata-sensitive checks

Test operations that commonly fail on synthetic or misconfigured mounts:

1. `chmod` behavior should at least fail in a documented and expected way if
   Mountpoint does not support changing mode post-mount.
2. `chown` behavior should also match documented Mountpoint semantics.
3. temp-file write then rename should work for the intended workload.

### Codex-specific reproduction check

Use the exact motivating scenario:

1. Mount a shared volume into the Codex home path used by the sandbox.
2. Toggle a setting that writes `config.toml`.
3. Confirm the file persists without app-side copy/sync code.
4. Restart the sandbox and confirm the setting remains.

### Multi-sandbox sanity check

Because Daytona volumes are shared:

1. Mount the same volume into two sandboxes.
2. Verify expected read-after-write visibility.
3. Verify no unexpected ownership mismatch appears between those sandboxes when
   they use the same OS user.

## Practical conclusion

The current behavior is not evidence that direct mounts are a bad model. It is
evidence that Daytona's current runner mount path is not yet user-aware enough
for workloads that expect a normal writable home directory.

The most promising path for a Daytona PR is:

- keep direct volume mounts
- keep `mount-s3`
- teach the runner to mount with the sandbox user's UID/GID
- then validate the resulting semantics against real home-directory workloads

## Quick reference: files most likely involved in a Daytona PR

- `apps/runner/pkg/docker/volumes_mountpaths.go`
- `apps/runner/pkg/docker/container_configs.go`
- `apps/runner/pkg/api/dto/sandbox.go`
- `apps/api/src/sandbox/dto/sandbox.dto.ts`
- `apps/api/src/sandbox/managers/sandbox-actions/sandbox-start.action.ts`
- `libs/sdk-typescript/src/Daytona.ts`
- `apps/docs/src/content/docs/en/volumes.mdx`
