import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'about_screen.dart';
import 'analytics_screen.dart';
import 'best_scorer_screen.dart';
import 'bot_screen.dart';
import 'bracket_screen.dart';
import 'cabinet_screen.dart';
import 'champion_screen.dart';
import 'compare_screen.dart';
import 'dm_inbox_screen.dart';
import 'kt_screen.dart';
import 'locale_menu.dart';
import 'preferences_screen.dart';
import 'multiview_screen.dart';
import 'my_predictions_screen.dart';
import 'my_rewards_screen.dart';
import 'my_stats_screen.dart';
import 'recovery_setup_screen.dart';
import 'roadmap_screen.dart';
import 'sessions_screen.dart';
import 'teams_screen.dart';
import 'verify_screen.dart';
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
          if (user != null)
            ListTile(
              leading: const Icon(Icons.workspace_premium),
              title: Text(context.tr('achievements.cabinetTitle')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => CabinetScreen(userId: user.id, name: user.name ?? user.email),
              )),
            ),
          ListTile(
            leading: const Icon(Icons.checklist),
            title: Text(context.tr('predictions.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const MyPredictionsScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.tune),
            title: Text(context.tr('prefs.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const PreferencesScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.forum),
            title: Text(context.tr('dm.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const DmInboxScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.query_stats),
            title: Text(context.tr('stats.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const MyStatsScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.card_giftcard),
            title: Text(context.tr('rewards.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const MyRewardsScreen()),
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
            leading: const Icon(Icons.compare_arrows),
            title: Text(context.tr('compare.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const CompareScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.groups_3),
            title: Text(context.tr('nav.teams')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const TeamsScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.account_tree),
            title: Text(context.tr('nav.bracket')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const BracketScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: Text(context.tr('about.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AboutScreen()),
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
          ListTile(
            leading: const Icon(Icons.emoji_events),
            title: Text(context.tr('nav.champion')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ChampionScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.sports_soccer),
            title: Text(context.tr('bestScorer.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const BestScorerScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.map),
            title: Text(context.tr('nav.roadmap')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const RoadmapScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.grid_view),
            title: Text(context.tr('nav.multiview')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const MultiviewScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.smart_toy),
            title: Text(context.tr('bot.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const BotScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.verified),
            title: Text(context.tr('verify.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const VerifyScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.verified_user),
            title: Text(context.tr('kt.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const KtScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.vpn_key),
            title: Text(context.tr('recovery.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const RecoverySetupScreen()),
            ),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.devices),
            title: Text(context.tr('sessions.title')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SessionsScreen()),
            ),
          ),
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
