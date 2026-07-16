import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// In-app notification center. Marks everything read on open; push delivery
/// (FCM/APNs) is a separate, later slice.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifs = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('notifications.title')),
        actions: [
          IconButton(
            icon: const Icon(Icons.done_all),
            tooltip: context.tr('notifications.markAllRead'),
            onPressed: () async {
              await ref.read(apiProvider).markNotificationsRead(all: true);
              ref.invalidate(notificationsProvider);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(notificationsProvider.future),
        child: AsyncValueView<NotificationsResponse>(
          value: notifs,
          onRetry: () => ref.invalidate(notificationsProvider),
          data: (res) => res.notifications.isEmpty
              ? ListView(children: [
                  const SizedBox(height: 80),
                  Center(child: Text(context.tr('notifications.empty'))),
                ])
              : ListView.separated(
                  itemCount: res.notifications.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) => _Tile(res.notifications[i]),
                ),
        ),
      ),
    );
  }
}

String _humanise(String enumCode) {
  final words = enumCode.toLowerCase().split('_');
  return words.map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
}

class _Tile extends StatelessWidget {
  const _Tile(this.n);
  final NotificationData n;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(n.read ? Icons.notifications_none : Icons.notifications_active,
          color: n.read ? null : Theme.of(context).colorScheme.primary),
      // The web maps each enum to a templated message; the app shows a
      // humanised type for now (per-type i18n templates are a later polish).
      title: Text(_humanise(n.type)),
      subtitle: Text(n.createdAt),
    );
  }
}
