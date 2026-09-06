import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../chat/dm_providers.dart';
import '../i18n/i18n_scope.dart';
import '../kt/kt_providers.dart' show KtKeyMismatch;
import '../theme/app_theme.dart';
import 'dm_room_screen.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/chat_line_tile.dart' show formatChatTime;
import 'widgets/empty_state.dart';
import 'widgets/online_dot.dart';
import 'widgets/panel.dart';
import 'widgets/user_avatar.dart';

/// Direct-message inbox: existing 1:1 threads + start a new one.
class DmInboxScreen extends ConsumerWidget {
  const DmInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final threads = ref.watch(dmThreadsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('dm.title'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _startDm(context, ref),
        icon: const Icon(Icons.edit_outlined),
        label: Text(context.tr('dm.new')),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(dmThreadsProvider.future),
        child: AsyncValueView<DmThreadsResponse>(
          value: threads,
          onRetry: () => ref.invalidate(dmThreadsProvider),
          data: (res) => res.threads.isEmpty
              ? EmptyState(message: context.tr('dm.empty'), icon: Icons.forum_outlined)
              : ListView(
                  padding: const EdgeInsets.only(top: 8, bottom: 96),
                  children: [
                    Panel(
                      children: [
                        for (final t in res.threads)
                          _ThreadRow(
                            thread: t,
                            onTap: () => Navigator.of(context).push(MaterialPageRoute(
                              builder: (_) =>
                                  DmRoomScreen(threadId: t.threadId, title: t.other.name),
                            )),
                          ),
                      ],
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Future<void> _startDm(BuildContext context, WidgetRef ref) async {
    final recipient = await showModalBottomSheet<Recipient>(
      context: context,
      builder: (context) => Consumer(
        builder: (context, ref, _) {
          final recipients = ref.watch(dmRecipientsProvider);
          return AsyncValueView<DmRecipientsResponse>(
            value: recipients,
            onRetry: () => ref.invalidate(dmRecipientsProvider),
            data: (res) => ListView(
              children: [
                for (final r in res.recipients)
                  ListTile(
                    leading: UserAvatar(name: r.name, radius: 16),
                    title: Text(r.name),
                    onTap: () => Navigator.pop(context, r),
                  ),
              ],
            ),
          );
        },
      ),
    );
    if (recipient == null || !context.mounted) return;
    final navigator = Navigator.of(context);
    try {
      final threadId = await ref.read(createDmProvider)(recipient.userId);
      navigator.push(MaterialPageRoute<void>(
        builder: (_) => DmRoomScreen(threadId: threadId, title: recipient.name),
      ));
    } on KtKeyMismatch {
      // Refusing to seal a key to a contradicted public key is a security event,
      // not a transient failure: say so instead of "could not start".
      if (context.mounted) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            icon: Icon(Icons.gpp_bad, color: ctx.tokens.live),
            title: Text(ctx.tr('dm.startRefused.title')),
            content: Text(ctx.tr('dm.startRefused.body')),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: Text(ctx.tr('common.confirm')),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (context.mounted) showToast(context, apiMessage(context, e));
    }
  }
}

/// One inbox row: the avatar with its presence dot, the name, the time of the
/// last message (the body is ciphertext on the server, so there is no preview)
/// and the unread count on a primary tag.
class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.thread, required this.onTap});
  final Thread thread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final unread = thread.unread.toInt();
    final last = thread.lastMessageAt;
    return PanelRow(
      onTap: onTap,
      chevron: true,
      leading: SizedBox(
        width: 40,
        height: 40,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            UserAvatar(name: thread.other.name, image: thread.other.image, radius: 20),
            PositionedDirectional(
              end: -1,
              bottom: -1,
              child: OnlineDot(userId: thread.other.id, size: 12),
            ),
          ],
        ),
      ),
      title: Text(thread.other.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.titleSmall
              ?.copyWith(fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.w500)),
      subtitle: last == null
          ? null
          : Text(formatChatTime(context, last),
              style: theme.textTheme.bodySmall?.copyWith(color: t.muted)),
      trailing: unread > 0
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text('$unread', style: t.score(15, color: scheme.primary)),
            )
          : null,
    );
  }
}
