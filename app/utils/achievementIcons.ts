// Shared badge presentation maps: a category's default icon and a tier's tint.
// The trophy cabinet and the inline rankings showcase both render from these, so a
// category (e.g. SHAME) lights up in every surface at once instead of drifting
// between duplicated copies - the SHAME thumbs-down once existed only in the cabinet.
export const ACHIEVEMENT_CATEGORY_ICON: Record<string, string> = {
  MILESTONE: 'pi pi-bolt',
  BEHAVIORAL: 'pi pi-clock',
  CROWD: 'pi pi-users',
  JOKER: 'pi pi-star',
  ORACLE: 'pi pi-eye',
  STREAK: 'pi pi-forward',
  TROPHY_META: 'pi pi-trophy',
  SHAME: 'pi pi-thumbs-down',
  SECRET: 'pi pi-sparkles',
}

export const ACHIEVEMENT_TIER_TINT: Record<string, string> = {
  BRONZE: '#cd7f32',
  SILVER: '#9ca3af',
  GOLD: '#eab308',
  // A bright cyan-white, clearly above gold on the shelf.
  DIAMOND: '#22d3ee',
}

// Fallback when a category has no mapped icon (defensive; every live category is mapped).
export const FALLBACK_ACHIEVEMENT_ICON = 'pi pi-verified'
