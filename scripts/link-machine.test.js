import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildLocalSourceUrlCandidates,
  buildRunCommand,
  deriveSignalExitCode,
  deriveCheckoutId,
  isLoopbackUrl,
  parseArgs,
  readBootstrapMarkdownValue,
  readMachineConnectRequestId,
  resolveStateDirectory,
} from './link-machine.js'

describe('link-machine', () => {
  it('derives a checkout id from codex worktree paths', () => {
    expect(deriveCheckoutId('/Users/nicu/.codex/worktrees/ad2a/noter')).toBe(
      'ad2a',
    )
  })

  it('falls back to the checkout leaf outside codex worktrees', () => {
    expect(deriveCheckoutId('/Users/nicu/dev/my/noter')).toBe('noter')
  })

  it('uses the derived checkout id for the default isolated state dir', () => {
    expect(
      resolveStateDirectory('/Users/nicu/.codex/worktrees/ad2a/noter', null),
    ).toBe(path.join(os.homedir(), '.noter', 'checkouts', 'ad2a'))
  })

  it('prefers an explicit source url over localhost probing', () => {
    expect(
      buildLocalSourceUrlCandidates('https://preview.noter.md/noter.js'),
    ).toEqual(['https://preview.noter.md/noter.js'])
  })

  it('orders default localhost source candidates with anon first', () => {
    expect(
      buildLocalSourceUrlCandidates(null, {
        ANON_VITE_PORT: '5190',
        VITE_PORT: '5180',
      }),
    ).toEqual([
      'http://127.0.0.1:5190/noter.js',
      'http://127.0.0.1:5180/noter.js',
      'http://127.0.0.1:5174/noter.js',
      'http://127.0.0.1:5173/noter.js',
      'http://127.0.0.1:5175/noter.js',
      'http://127.0.0.1:5176/noter.js',
      'http://127.0.0.1:5177/noter.js',
      'http://127.0.0.1:5178/noter.js',
      'http://127.0.0.1:5179/noter.js',
      'http://127.0.0.1:5181/noter.js',
      'http://127.0.0.1:5182/noter.js',
      'http://127.0.0.1:5183/noter.js',
      'http://127.0.0.1:5184/noter.js',
      'http://127.0.0.1:5185/noter.js',
      'http://127.0.0.1:5186/noter.js',
      'http://127.0.0.1:5187/noter.js',
      'http://127.0.0.1:5188/noter.js',
      'http://127.0.0.1:5189/noter.js',
    ])
  })

  it('reads next and run values from the bootstrap markdown block', () => {
    const markdown = [
      '# noter sync bootstrap ready',
      '',
      '- next: https://noter.md/machines/connect?openedByCli&requestId=request_123',
      "- run: curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run",
      '',
    ].join('\n')

    expect(readBootstrapMarkdownValue(markdown, 'next')).toBe(
      'https://noter.md/machines/connect?openedByCli&requestId=request_123',
    )
    expect(readBootstrapMarkdownValue(markdown, 'run')).toBe(
      "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run",
    )
  })

  it('extracts the request id from the machine connect url', () => {
    expect(
      readMachineConnectRequestId(
        'https://noter.md/machines/connect?openedByCli&requestId=request_123',
      ),
    ).toBe('request_123')
  })

  it('detects loopback urls for local auto-approval', () => {
    expect(isLoopbackUrl('http://127.0.0.1:3210')).toBe(true)
    expect(isLoopbackUrl('http://localhost:3210')).toBe(true)
    expect(isLoopbackUrl('https://noter.md')).toBe(false)
  })

  it('builds a quoted local run command', () => {
    expect(buildRunCommand("/tmp/O'Brien/.noter", 'linux')).toBe(
      `node packages/sync/noter.js run --state-dir '/tmp/O'"'"'Brien/.noter'`,
    )
  })

  it('builds a cmd.exe-safe local run command on windows', () => {
    expect(
      buildRunCommand(`C:\\Users\\100% ready\\O'Brien\\.noter`, 'win32', {
        ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      }),
    ).toBe(
      `node packages/sync/noter.js run --state-dir "C:\\Users\\100%% ready\\O'Brien\\.noter"`,
    )
  })

  it('builds a PowerShell-safe local run command on windows', () => {
    expect(
      buildRunCommand(`C:\\Users\\O'Brien\\App Data\\.noter`, 'win32', {
        PSModulePath:
          'C:\\Users\\nicu\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules',
      }),
    ).toBe(
      `node packages/sync/noter.js run --state-dir 'C:\\Users\\O''Brien\\App Data\\.noter'`,
    )
  })

  it('maps signal exits to non-zero shell exit codes', () => {
    expect(deriveSignalExitCode('SIGINT')).toBe(
      128 + os.constants.signals.SIGINT,
    )
  })

  it('parses feature flags for manual fallback modes', () => {
    expect(
      parseArgs([
        '--source-url',
        'https://preview.noter.md/noter.js',
        '--state-dir',
        '/tmp/noter-machine',
        '--no-open',
        '--no-auto-approve',
        '--no-run',
      ]),
    ).toEqual({
      autoApprove: false,
      openBrowser: false,
      runConnector: false,
      showHelp: false,
      sourceUrl: 'https://preview.noter.md/noter.js',
      stateDirectory: '/tmp/noter-machine',
    })
  })
})
