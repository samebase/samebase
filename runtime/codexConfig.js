const CODEX_NO_ALT_SCREEN_LINE = 'no_alt_screen = true'
const CODEX_TRUSTED_LINE = 'trust_level = "trusted"'

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

/**
 * @param {string} value
 * @returns {string}
 */
function quoteTomlString(value) {
  return JSON.stringify(value)
}

/**
 * Ensure the shared Daytona Codex config trusts the given project path.
 *
 * @param {string} existingConfig
 * @param {string} projectPath
 * @returns {string}
 */
export function upsertCodexProjectTrustConfig(existingConfig, projectPath) {
  const normalized = existingConfig.replace(/\r\n/g, '\n')
  const trimmedProjectPath = projectPath.trim()
  if (trimmedProjectPath.length === 0) {
    return ensureTrailingNewline(normalized)
  }

  const projectHeader = `[projects.${quoteTomlString(trimmedProjectPath)}]`
  const lines = normalized.length > 0 ? normalized.split('\n') : []
  const headerIndex = lines.findIndex(line => line.trim() === projectHeader)

  if (headerIndex === -1) {
    const trimmed = normalized.trim()
    const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : ''
    return ensureTrailingNewline(
      `${prefix}${projectHeader}\n${CODEX_TRUSTED_LINE}`,
    )
  }

  const nextTableIndex = lines.findIndex((line, index) => {
    if (index <= headerIndex) {
      return false
    }
    return /^\[[^\]\n]+\]\s*$/u.test(line.trim())
  })
  const tableEndIndex = nextTableIndex === -1 ? lines.length : nextTableIndex
  const trustPattern = /^\s*trust_level\s*=.*$/u

  for (let index = headerIndex + 1; index < tableEndIndex; index += 1) {
    if (trustPattern.test(lines[index])) {
      lines[index] = CODEX_TRUSTED_LINE
      return ensureTrailingNewline(lines.join('\n'))
    }
  }

  lines.splice(headerIndex + 1, 0, CODEX_TRUSTED_LINE)
  return ensureTrailingNewline(lines.join('\n'))
}
