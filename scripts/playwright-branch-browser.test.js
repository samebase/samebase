import path from 'node:path'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildPlaywrightCliConfig,
  ensurePlaywrightCliConfig,
  getPlaywrightCliConfigPath,
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
})
