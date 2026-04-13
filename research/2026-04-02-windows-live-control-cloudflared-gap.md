# Windows Live-Control Cloudflared Gap

Date: 2026-04-02

## Why This Note Exists

Native Windows machine bootstrap was reported as "failing" after a successful
`connect` and `run` flow. The screenshots for this report showed that the
machine actually connected and published presence, but live control stayed
unavailable.

This note captures the exact evidence from the Windows machine and the current
repo behavior on `main`.

## Evidence

### Browser Result

The Machines page showed the connected Windows machine as online with:

`The \`cloudflared\` command was not found. Install cloudflared before using
mobile live control.`

### Terminal Result

The terminal successfully ran:

`curl.exe -fsSL 'https://noter.md/noter.ts' | node --input-type=module - connect 'https://noter.md/noter.ts'`

and then:

`curl.exe -fsSL 'https://noter.md/noter.ts' | node --input-type=module - run`

The runner printed a normal connector startup summary and kept publishing
heartbeats, which means the bootstrap path itself was not blocked.

### Local Verification On This Windows Machine

Commands run from the repo checkout:

1. `Get-Command cloudflared` Result: no command found.
2. `where.exe cloudflared` Result: no matching executable found on `PATH`.
3. `winget list cloudflared` Result: no installed package found.
4. `winget search cloudflared` Result: `Cloudflare.cloudflared` is available for
   install.

### Code Path

`packages/sync/noter.ts` currently treats `cloudflared` as a live-control
prerequisite:

1. `runConnectorCommand()` only starts the quick tunnel after local control auth
   is ready.
2. `ensureCloudflaredBinary()` runs `cloudflared --version`.
3. If that spawn fails with `ENOENT`, it produces the same message seen in the
   screenshot.
4. The connector still keeps publishing presence heartbeats, so the machine can
   appear online even while live control stays unavailable.

### UX Drift

The current `MachineConnectPage` local requirements section explicitly lists
`node`, `codex`, and `curl`, but it does not mention `cloudflared` even though
the proposed live-control RFC already treats it as required for mobile live
control.

The runner output also only showed:

`- live-control: unavailable`

without the detailed reason, which made the shell transcript less actionable
than the browser state.

## Conclusion

This is not primarily a Windows bootstrap regression in `connect` or `run`.

The Windows machine was connecting successfully. The immediate reason live
control failed was that `cloudflared` was not installed or not available on
`PATH`.

The product gap on `main` was diagnostic clarity:

1. the browser setup copy did not name `cloudflared` as a live-control
   prerequisite
2. the terminal startup summary hid the live-control failure detail even though
   the browser already had it

## Recommended Follow-Up

1. mention `cloudflared --version` in the machine-connect local requirements
2. include the Windows install hint:
   `winget install --id Cloudflare.cloudflared -e`
3. print the live-control detail in the initial `noter-sync run` summary so the
   shell transcript explains why the machine is presence-only
