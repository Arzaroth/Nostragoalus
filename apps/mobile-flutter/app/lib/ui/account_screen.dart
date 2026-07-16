import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'analytics_screen.dart';
import 'locale_menu.dart';
import 'my_predictions_screen.dart';
import 'wrapped_screen.dart';

/// Account tab: who you are, your predictions, locale, sign out.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.account')),
        actions: const [LocaleMenu()],
      ),
      body: ListView(
        children: [
          const SizedBox(height: 16),
          Center(
            child: CircleAvatar(
              radius: 36,
              child: Text(
                (user?.name ?? user?.email ?? '?').characters.first.toUpperCase(),
                style: const TextStyle(fontSize: 28),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(user?.name ?? user?.email ?? '',
                style: Theme.of(context).textTheme.titleLarge),
          ),
          if (user?.name != null)
            Center(child: Text(user!.email, style: Theme.of(context).textTheme.bodySmall)),
          const SizedBox(height: 24),
          ListTile(
            leading: const Icon(Icons.checklist),
            title: Text(context.tr('predictions.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const MyPredictionsScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.insights),
            title: Text(context.tr('analytics.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AnalyticsScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.auto_awesome),
            title: Text(context.tr('wrapped.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const WrappedScreen()),
            ),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout),
            title: Text(context.tr('nav.signOut')),
            onTap: () => ref.read(authControllerProvider.notifier).signOut(),
          ),
        ],
      ),
    );
  }
}
