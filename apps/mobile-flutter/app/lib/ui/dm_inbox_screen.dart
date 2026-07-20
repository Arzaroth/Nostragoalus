import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../chat/dm_providers.dart';
import '../i18n/i18n_scope.dart';
import '../kt/kt_providers.dart' show KtKeyMismatch;
import 'dm_room_screen.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';

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
        icon: const Icon(Icons.edit),
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
                  children: [
                    for (final t in res.threads)
                      ListTile(
                        leading: CircleAvatar(
                            child: Text(t.other.name.characters.first.toUpperCase())),
                        title: Text(t.other.name),
                        trailing: t.unread > 0 ? Badge(label: Text('${t.unread.toInt()}')) : null,
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) =>
                              DmRoomScreen(threadId: t.threadId, title: t.other.name),
                        )),
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
                    leading: CircleAvatar(child: Text(r.name.characters.first.toUpperCase())),
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
            icon: Icon(Icons.gpp_bad, color: Theme.of(ctx).colorScheme.error),
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
