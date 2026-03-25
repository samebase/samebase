import path from 'node:path'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildPlaywrightCliConfig,
  buildDerivedSessionName,
  ensurePlaywrightCliConfig,
  getPlaywrightCliConfigPath,
  parseSessionDetailsFromListOutput,
  parseSessionStateFromListOutput,
  sanitizeChromeCrashRecoveryState,
} from './playwright-branch-browser.js'

describe('playwright-branch-browser', () => {
  it('pins the crash bubble suppression flag in the repo-owned cli config', () => {
    expect(buildPlaywrightCliConfig()).toEqual({
      browser: {
        browserName: 'chromium',
        launchOptions: {
          channel: 'chromium',
          args: ['--disable-session-crashed-bubble'],
        },
      },
    })
  })

  it('writes the config into the repo-local playwright metadata directory', () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), 'noter-playwright-cli-'))
    const configPath = ensurePlaywrightCliConfig(repoRoot)

    expect(configPath).toBe(getPlaywrightCliConfigPath(repoRoot))
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(
      buildPlaywrightCliConfig(),
    )
  })

  it('shortens derived session names so they fit local socket path limits', () => {
    expect(
      buildDerivedSessionName(
        '/Users/nicu/.codex/worktrees/0fb0/noter',
        'codex/disable-restore-pages-prompt',
      ),
    ).toBe('noter-drp-e06cfa')
  })

  it('clears persisted crash markers before relaunching a persistent profile', () => {
    const profileDir = mkdtempSync(path.join(tmpdir(), 'noter-chrome-profile-'))
    const defaultDir = path.join(profileDir, 'Default')

    mkdirSync(defaultDir, { recursive: true })
    writeFileSync(
      path.join(profileDir, 'Local State'),
      JSON.stringify({ variations_crash_streak: 4 }),
    )
    writeFileSync(
      path.join(profileDir, 'Variations'),
      JSON.stringify({
        'user_experience_metrics.stability.exited_cleanly': false,
        variations_crash_streak: 2,
      }),
    )
    writeFileSync(
      path.join(defaultDir, 'Preferences'),
      JSON.stringify({
        profile: { exit_type: 'Crashed' },
        sessions: {
          event_log: [
            { crashed: true, time: '1', type: 0 },
            { crashed: false, time: '2', type: 0 },
          ],
        },
      }),
    )

    sanitizeChromeCrashRecoveryState(profileDir)

    expect(
      JSON.parse(readFileSync(path.join(profileDir, 'Local State'), 'utf8')),
    ).toEqual({ variations_crash_streak: 0 })
    expect(
      JSON.parse(readFileSync(path.join(profileDir, 'Variations'), 'utf8')),
    ).toEqual({
      'user_experience_metrics.stability.exited_cleanly': true,
      variations_crash_streak: 0,
    })
    expect(
      JSON.parse(readFileSync(path.join(defaultDir, 'Preferences'), 'utf8')),
    ).toEqual({
      profile: { exit_type: 'Normal' },
      sessions: {
        event_log: [
          { crashed: false, time: '1', type: 0 },
          { crashed: false, time: '2', type: 0 },
        ],
      },
    })
  })

  it('distinguishes open sessions from closed remembered sessions', () => {
    const sampleOutput = [
      '57814cf9b7521b5a:',
      '- noter-drp-e06cfa:',
      '  - status: closed',
      '  - browser-type: chromium',
      '  - user-data-dir: /tmp/noter-drp-e06cfa',
      '  - headed: false',
      '- restore-smoke:',
      '  - status: open',
      '  - browser-type: chrome',
      '  - user-data-dir: /tmp/restore-smoke',
      '  - headed: true',
    ].join('\n')

    expect(
      parseSessionStateFromListOutput(sampleOutput, 'noter-drp-e06cfa'),
    ).toBe('closed')
    expect(parseSessionStateFromListOutput(sampleOutput, 'restore-smoke')).toBe(
      'open',
    )
    expect(
      parseSessionStateFromListOutput(sampleOutput, 'missing-session'),
    ).toBe('missing')
  })

  it('parses session browser details from playwright-cli list output', () => {
    const sampleOutput = [
      '57814cf9b7521b5a:',
      '- noter-drp-e06cfa:',
      '  - status: open',
      '  - browser-type: chromium',
      '  - user-data-dir: /tmp/noter-drp-e06cfa',
      '  - headed: true',
    ].join('\n')

    expect(
      parseSessionDetailsFromListOutput(sampleOutput, 'noter-drp-e06cfa'),
    ).toEqual({
      status: 'open',
      browserType: 'chromium',
      userDataDir: '/tmp/noter-drp-e06cfa',
      headed: true,
    })
  })
})
