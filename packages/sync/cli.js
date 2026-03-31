#!/usr/bin/env node

import { main } from './noter.js'

await main(process.argv.slice(2))
