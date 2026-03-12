import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prettier from 'prettier'
import {
  renderDaytonaRuntimeGeneratedTsModule,
  renderDockerfileDaytonaDeps,
} from '../runtime/daytonaRuntime.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const outputFiles = [
  {
    path: path.join(repoRoot, 'Dockerfile.daytona-deps'),
    contents: renderDockerfileDaytonaDeps(),
  },
  {
    path: path.join(repoRoot, 'apps/noter/convex/daytonaRuntime.generated.ts'),
    contents: renderDaytonaRuntimeGeneratedTsModule(),
  },
]

/**
 * @param {string} outputPath
 * @param {string} contents
 * @returns {Promise<string>}
 */
async function normalizeOutputContents(outputPath, contents) {
  const withTrailingNewline = contents.endsWith('\n')
    ? contents
    : `${contents}\n`

  if (path.extname(outputPath) !== '.ts') {
    return withTrailingNewline
  }

  return prettier.format(withTrailingNewline, {
    filepath: outputPath,
  })
}

async function main() {
  const checkOnly = process.argv.includes('--check')

  for (const output of outputFiles) {
    const normalized = await normalizeOutputContents(
      output.path,
      output.contents,
    )
    if (checkOnly) {
      const existing = await fs.readFile(output.path, 'utf8')
      if (existing !== normalized) {
        throw new Error(
          `Generated Daytona runtime output is stale: ${output.path}`,
        )
      }
      continue
    }

    await fs.mkdir(path.dirname(output.path), { recursive: true })
    await fs.writeFile(output.path, normalized, 'utf8')
  }
}

await main()
