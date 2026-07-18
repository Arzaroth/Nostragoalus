import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../chat/dm_providers.dart';
import '../i18n/i18n_scope.dart';
import 'dm_room_screen.dart';
import 'widgets/async_value_view.dart';

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
              ? ListView(children: [
                  const SizedBox(height: 80),
                  Center(child: Text(context.tr('dm.empty'))),
                ])
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
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final failed = context.tr('dm.startFailed');
    try {
      final threadId = await ref.read(createDmProvider)(recipient.userId);
      navigator.push(MaterialPageRoute(
        builder: (_) => DmRoomScreen(threadId: threadId, title: recipient.name),
      ));
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(failed)));
    }
  }
}
