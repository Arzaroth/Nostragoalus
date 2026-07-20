import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart' show Member;
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';

const _typingWindow = Duration(seconds: 5);

/// "X is typing…" for a league, off the hub's `chat:typing` frames.
class TypingIndicator extends ConsumerStatefulWidget {
  const TypingIndicator({super.key, required this.leagueId});

  final String leagueId;

  @override
  ConsumerState<TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends ConsumerState<TypingIndicator> {
  Timer? _expiry;

  @override
  void dispose() {
    _expiry?.cancel();
    super.dispose();
  }

  /// Nothing else rebuilds when an entry merely goes stale, so the indicator
  /// would stick until the next unrelated frame. Re-render at the first expiry.
  void _scheduleExpiry(Iterable<DateTime> stamps, DateTime now) {
    _expiry?.cancel();
    if (stamps.isEmpty) return;
    final soonest = stamps.reduce((a, b) => a.isBefore(b) ? a : b).add(_typingWindow);
    final wait = soonest.difference(now);
    _expiry = Timer(wait.isNegative ? Duration.zero : wait, () {
      if (mounted) setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final self = ref.watch(authControllerProvider).valueOrNull?.id;
    final now = DateTime.now();
    final fresh = <String, DateTime>{};
    for (final e in ref.watch(typingProvider).entries) {
      final parts = e.key.split('|');
      if (parts.length != 2 || parts[0] != widget.leagueId) continue;
      if (parts[1] == self) continue;
      if (now.difference(e.value) >= _typingWindow) continue;
      fresh[parts[1]] = e.value;
    }
    _scheduleExpiry(fresh.values, now);
    if (fresh.isEmpty) return const SizedBox.shrink();

    final members =
        ref.watch(leagueDetailProvider(widget.leagueId)).valueOrNull?.members ?? const <Member>[];
    String nameOf(String userId) {
      for (final m in members) {
        if (m.userId == userId) return m.name;
      }
      return context.tr('chat.unknownUser');
    }

    final ids = fresh.keys.toList();
    final label = switch (ids.length) {
      1 => context.tr('chat.typing.one', {'name': nameOf(ids[0])}),
      2 => context.tr('chat.typing.two', {'a': nameOf(ids[0]), 'b': nameOf(ids[1])}),
      _ => context.tr('chat.typing.many', {'n': ids.length}),
    };
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Padding(
        padding: const EdgeInsetsDirectional.only(start: 16, bottom: 2),
        child: Text(
          label,
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(fontStyle: FontStyle.italic),
        ),
      ),
    );
  }
}
