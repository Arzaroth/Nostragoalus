import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../reactions.dart';
import '../../state/providers.dart';

int _count(Total t, String emoji) => switch (emoji) {
      'FIRE' => t.fire.toInt(),
      'GOAL' => t.goal.toInt(),
      'WOW' => t.wow.toInt(),
      'LAUGH' => t.laugh.toInt(),
      'SAD' => t.sad.toInt(),
      _ => t.angry.toInt(),
    };

/// Emoji reactions for a match: tap to (re)act, counts update on success.
class ReactionsBar extends ConsumerWidget {
  const ReactionsBar({super.key, required this.matchId});
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reactions = ref.watch(reactionsProvider(matchId));
    return reactions.maybeWhen(
      data: (res) => Wrap(
        spacing: 8,
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
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? scheme.primaryContainer : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text('$glyph ${count > 0 ? count : ''}'.trim()),
      ),
    );
  }
}
