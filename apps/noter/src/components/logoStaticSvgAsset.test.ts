import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'

import { createStaticLogoSvgMarkup } from '@/components/logoStaticSvgAsset'

describe('logoStaticSvgAsset', () => {
  it('keeps the committed static logo svg in sync with the generated markup', () => {
    const staticLogoSvg = readFileSync(
      new URL('../../public/logo-static.svg', import.meta.url),
      'utf8',
    )
      .replace(/\r\n/g, '\n')
      .trim()
    const generatedSvg = createStaticLogoSvgMarkup()
      .replace(/\r\n/g, '\n')
      .trim()

    expect(staticLogoSvg).toBe(generatedSvg)
  })

  it('exports real face polygons instead of a raster traced into one-pixel rects', () => {
    const generatedStaticLogoSvgMarkup = createStaticLogoSvgMarkup()

    expect(generatedStaticLogoSvgMarkup).toContain('<polygon ')
    expect(generatedStaticLogoSvgMarkup).not.toContain(' height="1" ')
  })
})
