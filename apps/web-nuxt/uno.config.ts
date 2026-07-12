import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  // Dark variant keys off the same `.app-dark` class PrimeVue's theme uses.
  presets: [presetWind3({ dark: { dark: '.app-dark' } })],
})
