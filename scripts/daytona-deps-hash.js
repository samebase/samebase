#!/usr/bin/env node
// @ts-check

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_BASE_IMAGE =
  'mcr.microsoft.com/devcontainers/javascript-node:24-bookworm'
const DEFAULT_PNPM_VERSION = '9.15.0'
const LOCKFILE_PATH = 'pnpm-lock.yaml'
/** @type {readonly string[]} */
const INPUT_FILES = [
  'Dockerfile.daytona-deps',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'apps/noter/package.json',
  'apps/noter-starter-template/package.json',
]

/**
 * @param {import('node:crypto').BinaryLike} contents
 * @returns {string}
 */
function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

/**
 * @param {string} rootDir
 * @param {string} relativePath
 * @returns {Buffer}
 */
function readFileContents(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath)
  return fs.readFileSync(absolutePath)
}

/**
 * @param {string} rootDir
 * @returns {string}
 */
function computeLockHash(rootDir) {
  const lockfile = readFileContents(rootDir, LOCKFILE_PATH)
  return sha256(lockfile)
}

/**
 * @param {string} rootDir
 * @param {string} baseImage
 * @param {string} pnpmVersion
 * @returns {string}
 */
function computeInputHash(rootDir, baseImage, pnpmVersion) {
  const hash = createHash('sha256')
  hash.update(`baseImage=${baseImage}\n`)
  hash.update(`pnpmVersion=${pnpmVersion}\n`)

  for (const relativePath of INPUT_FILES) {
    const fileContents = readFileContents(rootDir, relativePath)
    const fileHash = sha256(fileContents)
    hash.update(`${relativePath}:${fileHash}\n`)
  }

  return hash.digest('hex')
}

/** @returns {void} */
function main() {
  const rootDir = process.cwd()
  const baseImage = process.env.DAYTONA_BASE_IMAGE?.trim() || DEFAULT_BASE_IMAGE
  const pnpmVersion =
    process.env.DAYTONA_PNPM_VERSION?.trim() ||
    process.env.PNPM_VERSION?.trim() ||
    DEFAULT_PNPM_VERSION

  const lockHash = computeLockHash(rootDir)
  const inputHash = computeInputHash(rootDir, baseImage, pnpmVersion)

  const githubOutput = process.env.GITHUB_OUTPUT
  if (githubOutput && githubOutput.length > 0) {
    fs.appendFileSync(githubOutput, `lock_hash=${lockHash}\n`)
    fs.appendFileSync(githubOutput, `input_hash=${inputHash}\n`)
  } else {
    process.stdout.write(`lock_hash=${lockHash}\n`)
    process.stdout.write(`input_hash=${inputHash}\n`)
  }
}

main()
