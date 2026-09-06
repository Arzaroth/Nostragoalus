import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../notifications_screen.dart';

/// App-bar bell with an unread badge; opens the notification center.
class NotificationsBell extends ConsumerWidget {
  const NotificationsBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadCountProvider);
    return IconButton(
      tooltip: context.tr('notifications.title'),
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text('$unread'),
        child: Icon(unread > 0 ? Icons.notifications : Icons.notifications_outlined),
      ),
      onPressed: () => Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => const NotificationsScreen())),
    );
  }
}
