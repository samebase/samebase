import { describe, expect, it } from 'vite-plus/test'

import {
  buildMachinesWorkspacePath,
  buildDirectNoterSyncConnectCommand,
  buildDirectNoterSyncRunCommand,
  buildNoterSyncScriptUrl,
  buildPublishedNoterSyncConnectCommand,
  buildPublishedNoterSyncRunCommand,
} from '@/lib/noterSync'

describe('noterSync', () => {
  it('builds the deploy-scoped noter sync script URL', () => {
    expect(buildNoterSyncScriptUrl('https://preview.noter.md')).toBe(
      'https://preview.noter.md/noter.js',
    )
  })

  it('builds the machines workspace route', () => {
    expect(
      buildMachinesWorkspacePath({
        machineId: 'machine:123',
        threadId: 'thread-123',
      }),
    ).toBe('/machines?machineId=machine%3A123&threadId=thread-123')
    expect(buildMachinesWorkspacePath()).toBe('/machines')
  })

  it('builds the published package command', () => {
    expect(buildPublishedNoterSyncConnectCommand()).toBe(
      'npx @noter-md/sync connect',
    )
  })

  it('builds the published package run command', () => {
    expect(buildPublishedNoterSyncRunCommand()).toBe('npx @noter-md/sync run')
  })

  it('builds the direct hosted-file command', () => {
    expect(
      buildDirectNoterSyncConnectCommand('https://noter.md/noter.js'),
    ).toBe(
      `curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`,
    )
  })

  it('builds the direct hosted-file run command', () => {
    expect(buildDirectNoterSyncRunCommand('https://noter.md/noter.js')).toBe(
      `curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`,
    )
  })

  it('builds PowerShell-safe direct hosted-file commands for Windows', () => {
    expect(
      buildDirectNoterSyncConnectCommand(
        'https://noter.md/noter.js',
        'windows',
      ),
    ).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`,
    )
    expect(
      buildDirectNoterSyncRunCommand('https://noter.md/noter.js', 'windows'),
    ).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`,
    )
  })
})
