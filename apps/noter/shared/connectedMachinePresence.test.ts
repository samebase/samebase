import { describe, expect, it } from 'vite-plus/test'

import {
  CONNECTED_MACHINE_STALE_AFTER_MS,
  MACHINE_REGISTRATION_REQUEST_TTL_MS,
  resolveAuthoritativeNow,
  resolveConnectedMachineStatus,
  resolveMachineRegistrationState,
} from './connectedMachinePresence'

describe('connected machine presence helpers', () => {
  it('treats explicit offline heartbeats as offline immediately', () => {
    expect(
      resolveConnectedMachineStatus({
        lastSeenAt: 1_000,
        now: 1_000,
        status: 'offline',
      }),
    ).toBe('offline')
  })

  it('ages stale online heartbeats into offline status', () => {
    expect(
      resolveConnectedMachineStatus({
        lastSeenAt: 1_000,
        now: 1_000 + CONNECTED_MACHINE_STALE_AFTER_MS + 1,
        status: 'online',
      }),
    ).toBe('offline')
  })

  it('keeps approved machine registrations approved after the ttl passes', () => {
    expect(
      resolveMachineRegistrationState({
        approvedAt: 2_000,
        expiresAt: 1_000 + MACHINE_REGISTRATION_REQUEST_TTL_MS,
        now: 1_000 + MACHINE_REGISTRATION_REQUEST_TTL_MS + 1,
      }),
    ).toBe('approved')
  })

  it('expires pending machine registrations after the ttl passes', () => {
    expect(
      resolveMachineRegistrationState({
        approvedAt: undefined,
        expiresAt: 1_000 + MACHINE_REGISTRATION_REQUEST_TTL_MS,
        now: 1_000 + MACHINE_REGISTRATION_REQUEST_TTL_MS + 1,
      }),
    ).toBe('expired')
  })

  it('advances pending registration expiry from server time instead of raw client time', () => {
    expect(
      resolveAuthoritativeNow({
        browserNow: 5_000,
        browserNowAtSync: 2_000,
        serverNowAtSync: 1_000,
      }),
    ).toBe(4_000)
  })
})
