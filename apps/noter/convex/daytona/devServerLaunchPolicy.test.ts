import { describe, expect, it } from 'vite-plus/test'
import {
  decideExistingDaytonaTmuxLaunch,
  describeDaytonaDevServerLaunchStatus,
} from './devServerLaunchPolicy'

describe('daytonaDevServerLaunchPolicy', () => {
  it('reuses the current tmux session when the preview port is already live', () => {
    expect(
      decideExistingDaytonaTmuxLaunch({
        portRunning: true,
        sessionState: 'running',
        sessionCreatedAtMs: Date.now() - 300_000,
        nowMs: Date.now(),
        startupGraceMs: 120_000,
      }),
    ).toBe('reuse_running')
  })

  it('keeps a recent running tmux session as an in-progress startup', () => {
    const nowMs = 1_000_000
    expect(
      decideExistingDaytonaTmuxLaunch({
        portRunning: false,
        sessionState: 'running',
        sessionCreatedAtMs: nowMs - 30_000,
        nowMs,
        startupGraceMs: 120_000,
      }),
    ).toBe('reuse_starting')
  })

  it('prefers reuse when tmux creation time is unavailable', () => {
    expect(
      decideExistingDaytonaTmuxLaunch({
        portRunning: false,
        sessionState: 'running',
        nowMs: Date.now(),
        startupGraceMs: 120_000,
      }),
    ).toBe('reuse_starting')
  })

  it('replaces stale or terminated tmux sessions when the port is still down', () => {
    const nowMs = 1_000_000
    expect(
      decideExistingDaytonaTmuxLaunch({
        portRunning: false,
        sessionState: 'running',
        sessionCreatedAtMs: nowMs - 180_000,
        nowMs,
        startupGraceMs: 120_000,
      }),
    ).toBe('replace')
    expect(
      decideExistingDaytonaTmuxLaunch({
        portRunning: false,
        sessionState: 'dead',
        nowMs,
        startupGraceMs: 120_000,
      }),
    ).toBe('replace')
    expect(
      decideExistingDaytonaTmuxLaunch({
        portRunning: false,
        sessionState: 'missing',
        nowMs,
        startupGraceMs: 120_000,
      }),
    ).toBe('replace')
  })

  it('describes launch states for user-facing messages', () => {
    expect(describeDaytonaDevServerLaunchStatus('started')).toBe('starting')
    expect(describeDaytonaDevServerLaunchStatus('already_running')).toBe(
      'already running',
    )
    expect(describeDaytonaDevServerLaunchStatus('already_starting')).toBe(
      'still starting',
    )
  })
})
