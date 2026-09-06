import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../reactions.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';

int _count(Total t, String emoji) => switch (emoji) {
      'FIRE' => t.fire.toInt(),
      'GOAL' => t.goal.toInt(),
      'WOW' => t.wow.toInt(),
      'LAUGH' => t.laugh.toInt(),
      'SAD' => t.sad.toInt(),
      _ => t.angry.toInt(),
    };

/// Emoji reactions for a match as stadium chips: tap to (re)act, counts update
/// on success.
class ReactionsBar extends ConsumerWidget {
  const ReactionsBar({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reactions = ref.watch(reactionsProvider(matchId));
    return reactions.maybeWhen(
      data: (res) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final (emoji, glyph) in reactionPalette)
            _Chip(
              glyph: glyph,
              count: _count(res.totals, emoji),
              selected: res.mine?.wire == emoji,
              onTap: () async {
                await ref.read(apiProvider).react(matchId, emoji);
                ref.invalidate(reactionsProvider(matchId));
              },
            ),
        ],
      ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(
      {required this.glyph, required this.count, required this.selected, required this.onTap});
  final String glyph;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = context.tokens;
    return InkWell(
      customBorder: const StadiumBorder(),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: ShapeDecoration(
          color: selected ? scheme.primary.withValues(alpha: 0.14) : null,
          shape: StadiumBorder(side: BorderSide(color: selected ? scheme.primary : t.ruleStrong)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(glyph, style: const TextStyle(fontSize: 16)),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Text('$count',
                  style: t.score(15, color: selected ? scheme.primary : scheme.onSurface)),
            ],
          ],
        ),
      ),
    );
  }
}
