import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../chat/chat_providers.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';
import 'widgets/user_avatar.dart';

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
                  padding: const EdgeInsets.only(top: 4, bottom: 24),
                  children: [
                    Panel(
                      children: [
                        for (final r in list)
                          _ReportRow(
                            report: r,
                            onRestore: () => _act(context, ref, r.messageId, 'restore'),
                            onRemove: () => _act(context, ref, r.messageId, 'remove'),
                          ),
                      ],
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

/// One reported message: the author line, the decrypted text (or the
/// undecryptable notice), the report count and state, and the one action the
/// current state allows.
class _ReportRow extends StatelessWidget {
  const _ReportRow({required this.report, required this.onRestore, required this.onRemove});
  final ModerationReport report;
  final VoidCallback onRestore;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final r = report;
    final author = r.authorName;
    final removed = r.moderation == ModerationValue.removed;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (author != null) ...[
            Row(
              children: [
                UserAvatar(radius: 12, name: author, image: r.authorImage),
                const SizedBox(width: 8),
                Text(author, style: theme.textTheme.labelMedium),
              ],
            ),
            const SizedBox(height: 8),
          ],
          Text(
            r.text ?? context.tr('chat.undecryptable'),
            style: r.text == null
                ? theme.textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic, color: t.muted)
                : theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Tag(context.tr('moderation.reportCount').replaceAll('{n}', '${r.reports}'),
                  color: t.live, icon: Icons.flag_outlined),
              const SizedBox(width: 6),
              Tag(r.moderation.wire, color: removed ? t.faint : null),
              const Spacer(),
              if (removed)
                TextButton(onPressed: onRestore, child: Text(context.tr('moderation.restore')))
              else
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: scheme.error),
                  onPressed: onRemove,
                  child: Text(context.tr('moderation.remove')),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
