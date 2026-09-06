import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../notifications/message.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';

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
              ? EmptyState(
                  icon: Icons.notifications_none_outlined,
                  message: context.tr('notifications.empty'),
                )
              : ListView(
                  padding: const EdgeInsets.only(top: 8, bottom: 24),
                  children: [
                    Panel(children: [for (final n in res.notifications) _Row(n)]),
                  ],
                ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.n);
  final NotificationsResponseNotification n;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return PanelRow(
      selected: !n.read,
      leading: Icon(notificationIcon(n.type.wire, read: n.read),
          color: n.read ? null : scheme.primary),
      title: Text(notificationMessage(n.type.wire, n.data, context.tr),
          style: n.read ? null : const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(formatNotificationDate(n.createdAt)),
    );
  }
}
