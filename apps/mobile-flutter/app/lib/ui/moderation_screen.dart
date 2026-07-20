import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/chat_providers.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';

/// League chat moderation queue (owner/moderators): reported messages decrypted
/// client-side, each removable or restorable.
class ModerationScreen extends ConsumerWidget {
  const ModerationScreen({super.key, required this.leagueId});
  final String leagueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reports = ref.watch(moderationReportsProvider(leagueId));
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('moderation.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(moderationReportsProvider(leagueId).future),
        child: AsyncValueView<List<ModerationReport>>(
          value: reports,
          onRetry: () => ref.invalidate(moderationReportsProvider(leagueId)),
          data: (list) => list.isEmpty
              ? EmptyState(message: context.tr('moderation.empty'), icon: Icons.flag_outlined)
              : ListView(
                  children: [
                    for (final r in list)
                      Card(
                        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(r.text ?? context.tr('chat.undecryptable'),
                                  style: r.text == null
                                      ? const TextStyle(fontStyle: FontStyle.italic)
                                      : null),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Chip(
                                    label: Text(context
                                        .tr('moderation.reportCount')
                                        .replaceAll('{n}', '${r.reports}')),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(r.moderation,
                                      style: Theme.of(context).textTheme.bodySmall),
                                  const Spacer(),
                                  if (r.moderation == 'REMOVED')
                                    TextButton(
                                      onPressed: () =>
                                          _act(context, ref, r.messageId, 'restore'),
                                      child: Text(context.tr('moderation.restore')),
                                    )
                                  else
                                    TextButton(
                                      style: TextButton.styleFrom(
                                          foregroundColor: Theme.of(context).colorScheme.error),
                                      onPressed: () =>
                                          _act(context, ref, r.messageId, 'remove'),
                                      child: Text(context.tr('moderation.remove')),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }

  Future<void> _act(
      BuildContext context, WidgetRef ref, String messageId, String action) async {
    final ok = await runAction(
      context,
      () => ref.read(apiProvider).moderateChatMessage(leagueId, messageId, action),
      successKey: 'chat.moderation.done',
    );
    if (ok) ref.invalidate(moderationReportsProvider(leagueId));
  }
}
