import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

// Nostragoalus theme: a vibrant indigo primary (pairs with the emerald brand accent).
export const NostraTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f5f6fc',
          100: '#ebedf7',
          200: '#d8dcef',
          300: '#bcc2e0',
          400: '#9197bd',
          500: '#686e94',
          600: '#4c5275',
          700: '#3a3f5b',
          800: '#262a3f',
          900: '#181b2b',
          950: '#0d0f1a',
        },
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.700}',
          focusColor: '{primary.800}',
        },
      },
      dark: {
        primary: {
          color: '{primary.400}',
          contrastColor: '{surface.950}',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        highlight: {
          background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)',
        },
      },
    },
  },
})
