import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../notifications/message.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';

/// In-app notification center. Push delivery (FCM/APNs) is a separate, later
/// slice; "mark all read" is an explicit action here.
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
              await runAction(context, () async {
                await ref.read(apiProvider).markNotificationsRead(all: true);
                ref.invalidate(notificationsProvider);
              });
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
              ? EmptyState(message: context.tr('notifications.empty'))
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

class _Tile extends StatelessWidget {
  const _Tile(this.n);
  final NotificationsResponseNotification n;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(notificationIcon(n.type.wire, read: n.read),
            color: n.read ? null : Theme.of(context).colorScheme.primary),
        title: Text(notificationMessage(n.type.wire, n.data, context.tr)),
        subtitle: Text(formatNotificationDate(n.createdAt)),
      );
}
