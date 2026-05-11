# TanStack npm compromise check

## Summary

On May 11, 2026, TanStack disclosed a supply-chain compromise affecting
published `@tanstack/*` packages. The committed Noter lockfile does not contain
the compromised package versions or the known malware fingerprint, so this
checkout does not appear compromised by the incident.

This branch still pins the affected direct TanStack router packages to the
already-locked known-good versions because the direct `package.json` ranges were
wide enough to admit the compromised releases during a fresh resolution.

## Sources

- TanStack X advisory: https://x.com/tan_stack/status/2053948103766716630
- TanStack router issue: https://github.com/TanStack/router/issues/7383
- Socket campaign tracker:
  https://socket.dev/supply-chain-attacks/mini-shai-hulud

## Advisory details

The TanStack X post said the affected versions were published around 19:20-19:30
UTC on May 11, 2026 and described the package-level fingerprint as:

```json
"optionalDependencies": {
  "@tanstack/setup": "github:tanstack/router#79ac49eedf774dd4b0cfa308722bc463cfe5885c"
}
```

The GitHub issue discussion describes the same fingerprint and says the payload
runs through the git dependency's prepare lifecycle. Socket's tracker lists
affected artifacts including the TanStack router package family published in two
waves around 19:20 UTC and 19:26 UTC.

## Noter exposure

The locked Noter versions are older than the affected artifacts relevant to this
repo:

| Package                           |       Locked in Noter | Known bad versions checked |
| --------------------------------- | --------------------: | -------------------------- |
| `@tanstack/react-router`          |            `1.168.10` | `1.169.5`, `1.169.8`       |
| `@tanstack/router-plugin`         |            `1.167.12` | `1.167.38`, `1.167.41`     |
| `@tanstack/virtual-file-routes`   |             `1.161.7` | `1.161.10`, `1.161.13`     |
| `@tanstack/solid-router`          |            `1.168.20` | `1.169.5`, `1.169.8`       |
| `@tanstack/solid-router-devtools` |            `1.166.13` | `1.166.16`, `1.166.19`     |
| `@tanstack/history`               |             `1.161.6` | `1.161.9`, `1.161.12`      |
| `@tanstack/router-core`           | `1.168.9`, `1.168.15` | `1.169.5`, `1.169.8`       |
| `@tanstack/router-devtools-core`  |             `1.167.3` | `1.167.6`, `1.167.9`       |
| `@tanstack/router-generator`      |            `1.166.24` | `1.166.45`, `1.166.48`     |
| `@tanstack/router-utils`          |             `1.161.6` | `1.161.11`, `1.161.14`     |

The last dependency update touching the lockfile was commit
`61e2b997e4605ac2197fc630c29095f0c37e76a9`, committed at 2026-05-11 18:08:37
+0300, which is 15:08:37 UTC and before the reported malicious publish window.

## Checks run

These checks produced no matches:

```bash
grep -R "@tanstack/setup\|router_init\.js\|79ac49eedf774dd4b0cfa308722bc463cfe5885c" -n pnpm-lock.yaml package.json apps packages .codespace-agent
find node_modules/.pnpm -path "*@tanstack*" -name "router_init.js" -print
find node_modules/.pnpm -path "*@tanstack*" -name package.json -print | while read file; do node -e 'const fs=require("fs"); const p=process.argv[1]; const json=JSON.parse(fs.readFileSync(p,"utf8")); const opt=json.optionalDependencies||{}; if (opt["@tanstack/setup"] || JSON.stringify(opt).includes("79ac49eedf774dd4b0cfa308722bc463cfe5885c")) console.log(p);' "$file"; done
```

`npm view` confirmed the known bad versions for the affected direct packages
carry the `@tanstack/setup` optional dependency and are deprecated with a
security warning, while the already-locked known-good versions checked here did
not report that optional dependency.

## Action

- Pin affected direct TanStack router packages in app package manifests to the
  current known-good lockfile versions.
- Make GitHub workflow installs use `pnpm install --frozen-lockfile` explicitly.

## Operator guidance

No credential rotation is indicated from this repository state alone. Rotate and
rebuild hosts only if a machine or CI job resolved or installed one of the known
bad versions during the May 11, 2026 19:20-19:30 UTC window, or if local scans
find the fingerprint above.
