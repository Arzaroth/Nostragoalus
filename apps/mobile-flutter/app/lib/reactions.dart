/// Mirror of `shared/reactions.ts`. The KEY is what the API stores and validates
/// (`z.enum(REACTION_EMOJIS)`); the glyph is render-only. Both league chat, DMs
/// and match reactions post the key, never the glyph.
const reactionEmojis = ['FIRE', 'GOAL', 'WOW', 'LAUGH', 'SAD', 'ANGRY'];

const reactionGlyphs = <String, String>{
  'FIRE': '🔥',
  'GOAL': '⚽',
  'WOW': '😮',
  'LAUGH': '🤣',
  'SAD': '😢',
  'ANGRY': '😡',
};

/// Display order, paired for `for (final (key, glyph) in reactionPalette)`.
const reactionPalette = [
  ('FIRE', '🔥'),
  ('GOAL', '⚽'),
  ('WOW', '😮'),
  ('LAUGH', '🤣'),
  ('SAD', '😢'),
  ('ANGRY', '😡'),
];
