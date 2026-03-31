#!/usr/bin/env node

// Keep the published CLI entrypoint as a thin wrapper so `main()` remains the
// single source of truth for runtime behavior and error semantics.
import { main } from './noter.js'

try {
  await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
