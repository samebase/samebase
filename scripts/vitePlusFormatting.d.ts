import type { FormatConfig } from 'vite-plus/fmt'

export declare const vitePlusFormatterConfig: FormatConfig

export declare function formatWithRepoVitePlus(args: {
  filepath: string
  sourceText: string
}): Promise<string>
