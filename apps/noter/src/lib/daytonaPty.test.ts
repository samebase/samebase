import { describe, expect, it } from 'vite-plus/test'

import {
  buildAuthenticatedDaytonaPtyUrl,
  hasDaytonaPtyInitialOutput,
  parseDaytonaPtyCloseMessage,
  parseDaytonaPtyControlMessage,
  resolveDaytonaPtyCloseOutcome,
  shouldWakeDaytonaPtyPrompt,
} from './daytonaPty'

describe('daytonaPty helpers', () => {
  it('adds the preview token to the PTY websocket URL', () => {
    const authenticatedUrl = buildAuthenticatedDaytonaPtyUrl({
      webSocketUrl:
        'wss://example.test/sandbox/process/pty/noter-pty/connect?existing=1',
      previewToken: 'preview-token',
    })

    const url = new URL(authenticatedUrl)
    expect(url.searchParams.get('existing')).toBe('1')
    expect(url.searchParams.get('DAYTONA_SANDBOX_AUTH_KEY')).toBe(
      'preview-token',
    )
  })

  it('parses control messages and trims empty errors', () => {
    expect(
      parseDaytonaPtyControlMessage(
        JSON.stringify({
          type: 'control',
          status: 'connected',
          error: '   ',
        }),
      ),
    ).toEqual({
      type: 'control',
      status: 'connected',
    })

    expect(
      parseDaytonaPtyControlMessage(
        JSON.stringify({
          type: 'control',
          status: 'error',
          error: 'toolbox failed',
        }),
      ),
    ).toEqual({
      type: 'control',
      status: 'error',
      error: 'toolbox failed',
    })
  })

  it('ignores malformed or unsupported control messages', () => {
    expect(parseDaytonaPtyControlMessage('not json')).toBeNull()
    expect(parseDaytonaPtyControlMessage('[]')).toBeNull()
    expect(
      parseDaytonaPtyControlMessage(
        JSON.stringify({
          type: 'unknown',
          status: 'connected',
        }),
      ),
    ).toBeNull()
    expect(
      parseDaytonaPtyControlMessage(
        JSON.stringify({
          type: 'control',
          status: 'pending',
        }),
      ),
    ).toBeNull()
  })

  it('parses close messages and drops empty fields', () => {
    expect(
      parseDaytonaPtyCloseMessage(
        JSON.stringify({
          exitCode: 0,
          error: '  ',
          exitReason: ' finished ',
        }),
      ),
    ).toEqual({
      exitCode: 0,
      exitReason: ' finished ',
    })
  })

  it('returns null for close payloads with no usable fields', () => {
    expect(parseDaytonaPtyCloseMessage('not json')).toBeNull()
    expect(parseDaytonaPtyCloseMessage('[]')).toBeNull()
    expect(parseDaytonaPtyCloseMessage(JSON.stringify({}))).toBeNull()
  })

  it('treats exit reasons as informational when the process exits cleanly', () => {
    expect(
      resolveDaytonaPtyCloseOutcome({
        eventCode: 1000,
        rawReason: JSON.stringify({
          exitCode: 0,
          exitReason: 'device auth completed',
        }),
      }),
    ).toEqual({
      message: 'Process exited with code 0. device auth completed',
      state: 'closed',
    })
  })

  it('treats explicit PTY errors, non-zero exit codes, and abnormal closes as errors', () => {
    expect(
      resolveDaytonaPtyCloseOutcome({
        eventCode: 1000,
        rawReason: JSON.stringify({
          error: 'toolbox failed',
        }),
      }),
    ).toEqual({
      message: 'Terminal session closed. toolbox failed',
      state: 'error',
    })

    expect(
      resolveDaytonaPtyCloseOutcome({
        eventCode: 1000,
        rawReason: JSON.stringify({
          exitCode: 1,
        }),
      }),
    ).toEqual({
      message: 'Process exited with code 1.',
      state: 'error',
    })

    expect(
      resolveDaytonaPtyCloseOutcome({
        eventCode: 1011,
        rawReason: '',
      }),
    ).toEqual({
      message: 'Terminal connection closed.',
      state: 'error',
    })
  })

  it('detects when a PTY session already has initial output', () => {
    expect(hasDaytonaPtyInitialOutput(undefined)).toBe(false)
    expect(hasDaytonaPtyInitialOutput('')).toBe(false)
    expect(hasDaytonaPtyInitialOutput('root prompt')).toBe(true)
  })

  it('only wakes the shell prompt for interactive sessions with no startup output', () => {
    expect(
      shouldWakeDaytonaPtyPrompt({
        allowInput: true,
        initialInput: undefined,
        initialOutput: undefined,
      }),
    ).toBe(true)

    expect(
      shouldWakeDaytonaPtyPrompt({
        allowInput: false,
        initialInput: undefined,
        initialOutput: undefined,
      }),
    ).toBe(false)

    expect(
      shouldWakeDaytonaPtyPrompt({
        allowInput: true,
        initialInput: 'codex login --device-auth\n',
        initialOutput: undefined,
      }),
    ).toBe(false)

    expect(
      shouldWakeDaytonaPtyPrompt({
        allowInput: true,
        initialInput: undefined,
        initialOutput: 'root prompt',
      }),
    ).toBe(false)
  })
})
