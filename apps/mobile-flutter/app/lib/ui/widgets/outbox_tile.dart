import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../chat/outbox.dart';
import '../../i18n/i18n_scope.dart';
import '../../theme/app_theme.dart';

/// Renders one pending/failed outgoing message as an own bubble: faint text
/// with "Sending…" while in flight, or "Not sent" in live red with Retry /
/// Discard on failure so the text is never lost.
class OutboxTile extends ConsumerWidget {
  const OutboxTile({super.key, required this.entry});
  final OutboxEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final small = theme.textTheme.labelSmall;
    final bubble = Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: const BorderRadiusDirectional.only(
          topStart: Radius.circular(16),
          topEnd: Radius.circular(16),
          bottomStart: Radius.circular(16),
          bottomEnd: Radius.circular(4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(entry.text,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: entry.failed ? scheme.onSurface : t.faint)),
          const SizedBox(height: 4),
          if (entry.failed)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline, size: 14, color: t.live),
                const SizedBox(width: 4),
                Text(context.tr('chat.notSent'), style: small?.copyWith(color: t.live)),
                const SizedBox(width: 8),
                TextButton(
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    minimumSize: const Size(0, 28),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    textStyle: theme.textTheme.labelMedium,
                  ),
                  onPressed: () => ref.read(chatOutboxProvider.notifier).retry(entry.localId),
                  child: Text(context.tr('chat.retry')),
                ),
                TextButton(
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    minimumSize: const Size(0, 28),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    foregroundColor: t.muted,
                    textStyle: theme.textTheme.labelMedium,
                  ),
                  onPressed: () => ref.read(chatOutboxProvider.notifier).discard(entry.localId),
                  child: Text(context.tr('chat.discard')),
                ),
              ],
            )
          else
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 10,
                  height: 10,
                  child: CircularProgressIndicator(strokeWidth: 1.5, color: t.faint),
                ),
                const SizedBox(width: 6),
                Text(context.tr('chat.sending'), style: small?.copyWith(color: t.faint)),
              ],
            ),
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [bubble]),
    );
  }
}
