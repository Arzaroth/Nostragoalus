import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, type VNode } from './template'

export interface ShareFont {
  name: string
  data: Buffer | ArrayBuffer
  weight: 400 | 700
  style: 'normal'
}

// satori turns the element tree into an SVG (text is traced to paths using the
// embedded fonts, so the result is self-contained); resvg rasterizes it to PNG.
// Fonts are passed in so this stays a pure transform - the route owns loading
// them from bundled server assets.
export async function renderShareCardPng(
  element: VNode,
  fonts: ShareFont[],
  width: number = SHARE_CARD_WIDTH,
  height: number = SHARE_CARD_HEIGHT,
): Promise<Buffer> {
  const svg = await satori(element as never, { width, height, fonts: fonts as never })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
  return Buffer.from(png)
}
