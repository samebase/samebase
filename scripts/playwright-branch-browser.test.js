import path from 'node:path'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildPlaywrightCliConfig,
  buildDerivedSessionName,
  ensurePlaywrightCliConfig,
  getPlaywrightCliConfigPath,
  sanitizeChromeCrashRecoveryState,
} from './playwright-branch-browser.js'

describe('playwright-branch-browser', () => {
  it('pins the crash bubble suppression flag in the repo-owned cli config', () => {
    expect(buildPlaywrightCliConfig()).toEqual({
      browser: {
        launchOptions: {
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
    ).toBe('noter-drp-7113b8')
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
})
