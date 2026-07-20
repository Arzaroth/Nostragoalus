import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../chat/outbox.dart';
import '../../i18n/i18n_scope.dart';

/// Renders one pending/failed outgoing message: "Sending…" while in flight, or
/// "Not sent" with Retry / Discard on failure so the text is never lost.
class OutboxTile extends ConsumerWidget {
  const OutboxTile({super.key, required this.entry});
  final OutboxEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final muted = Theme.of(context).textTheme.bodySmall;
    return ListTile(
      dense: true,
      title: Text(entry.text, style: TextStyle(color: Theme.of(context).disabledColor)),
      subtitle: entry.failed
          ? Row(
              children: [
                Text(context.tr('chat.notSent'),
                    style: muted?.copyWith(color: Theme.of(context).colorScheme.error)),
                const Spacer(),
                TextButton(
                  onPressed: () => ref.read(chatOutboxProvider.notifier).retry(entry.localId),
                  child: Text(context.tr('chat.retry')),
                ),
                TextButton(
                  onPressed: () => ref.read(chatOutboxProvider.notifier).discard(entry.localId),
                  child: Text(context.tr('chat.discard')),
                ),
              ],
            )
          : Text(context.tr('chat.sending'), style: muted),
      trailing: entry.failed
          ? Icon(Icons.error_outline, size: 18, color: Theme.of(context).colorScheme.error)
          : const SizedBox(
              width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
    );
  }
}
