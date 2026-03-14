const CODEX_NO_ALT_SCREEN_LINE = 'no_alt_screen = true'

/**
 * @param {string} value
 * @returns {string}
 */
function ensureTrailingNewline(value) {
  return value.endsWith('\n') ? value : `${value}\n`
}

/**
 * Ensure the Daytona-shared Codex config disables alt-screen mode.
 *
 * This keeps interactive Codex usable in the Daytona web terminal, whose xterm
 * transport does not reliably deliver trust-prompt input after alt-screen
 * takeover.
 *
 * @param {string} existingConfig
 * @returns {string}
 */
export function upsertCodexNoAltScreenConfig(existingConfig) {
  const normalized = existingConfig.replace(/\r\n/g, '\n')
  const existingSettingPattern = /^no_alt_screen\s*=.*$/m

  if (existingSettingPattern.test(normalized)) {
    return ensureTrailingNewline(
      normalized.replace(existingSettingPattern, CODEX_NO_ALT_SCREEN_LINE),
    )
  }

  const firstTableMatch = normalized.match(/^\[[^\]\n]+\]\s*$/m)
  if (firstTableMatch && typeof firstTableMatch.index === 'number') {
    const beforeTables = normalized
      .slice(0, firstTableMatch.index)
      .replace(/\s*$/u, '')
    const fromFirstTable = normalized
      .slice(firstTableMatch.index)
      .replace(/^\n+/u, '')
    const prefix = beforeTables.length > 0 ? `${beforeTables}\n\n` : ''
    return ensureTrailingNewline(
      `${prefix}${CODEX_NO_ALT_SCREEN_LINE}\n\n${fromFirstTable}`,
    )
  }

  const trimmed = normalized.trim()
  if (trimmed.length === 0) {
    return `${CODEX_NO_ALT_SCREEN_LINE}\n`
  }

  return ensureTrailingNewline(
    `${normalized.replace(/\s*$/u, '')}\n${CODEX_NO_ALT_SCREEN_LINE}`,
  )
}
