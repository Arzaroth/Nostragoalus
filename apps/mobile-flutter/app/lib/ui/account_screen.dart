import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'about_screen.dart';
import 'analytics_screen.dart';
import 'best_scorer_screen.dart';
import 'bot_screen.dart';
import 'bracket_screen.dart';
import 'cabinet_screen.dart';
import 'calendar_screen.dart';
import 'champion_screen.dart';
import 'compare_screen.dart';
import 'dm_inbox_screen.dart';
import 'edit_profile_screen.dart';
import 'feedback.dart';
import 'kt_screen.dart';
import 'locale_menu.dart';
import 'map_screen.dart';
import 'multiview_screen.dart';
import 'my_predictions_screen.dart';
import 'my_rewards_screen.dart';
import 'my_stats_screen.dart';
import 'onboarding_tour.dart';
import 'preferences_screen.dart';
import 'recovery_setup_screen.dart';
import 'roadmap_screen.dart';
import 'sessions_screen.dart';
import 'teams_screen.dart';
import 'two_factor_screen.dart';
import 'verify_screen.dart';
import 'wrapped_screen.dart';

class _Entry {
  const _Entry(this.icon, this.labelKey, this.open);
  final IconData icon;
  final String labelKey;
  final void Function(BuildContext context) open;
}

void _open(BuildContext context, Widget screen) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

/// Grouped by what the user came for: their own game, then the tournament
/// views, then app-level things. Account + security is [_security], last.
final _sections = <List<_Entry>>[
  [
    _Entry(Icons.checklist, 'predictions.title', (c) => _open(c, const MyPredictionsScreen())),
    _Entry(Icons.query_stats, 'stats.title', (c) => _open(c, const MyStatsScreen())),
    _Entry(Icons.insights, 'analytics.title', (c) => _open(c, const AnalyticsScreen())),
    _Entry(Icons.compare_arrows, 'compare.title', (c) => _open(c, const CompareScreen())),
    _Entry(Icons.card_giftcard, 'rewards.title', (c) => _open(c, const MyRewardsScreen())),
    _Entry(Icons.emoji_events, 'nav.champion', (c) => _open(c, const ChampionScreen())),
    _Entry(Icons.sports_soccer, 'bestScorer.title', (c) => _open(c, const BestScorerScreen())),
    _Entry(Icons.auto_awesome, 'wrapped.title', (c) => _open(c, const WrappedScreen())),
  ],
  [
    _Entry(Icons.account_tree, 'nav.bracket', (c) => _open(c, const BracketScreen())),
    _Entry(Icons.groups_3, 'nav.teams', (c) => _open(c, const TeamsScreen())),
    _Entry(Icons.public, 'nav.map', (c) => _open(c, const MapScreen())),
    _Entry(Icons.grid_view, 'nav.multiview', (c) => _open(c, const MultiviewScreen())),
    _Entry(Icons.smart_toy, 'bot.title', (c) => _open(c, const BotScreen())),
    _Entry(Icons.calendar_month, 'calendar.title', (c) => _open(c, const CalendarScreen())),
  ],
  [
    _Entry(Icons.forum, 'dm.title', (c) => _open(c, const DmInboxScreen())),
    _Entry(Icons.tune, 'prefs.title', (c) => _open(c, const PreferencesScreen())),
    _Entry(Icons.school, 'onboarding.takeTour', showOnboardingTour),
    _Entry(Icons.map, 'nav.roadmap', (c) => _open(c, const RoadmapScreen())),
    _Entry(Icons.info_outline, 'about.title', (c) => _open(c, const AboutScreen())),
  ],
];

final _security = <_Entry>[
  _Entry(Icons.shield, 'twofa.title', (c) => _open(c, const TwoFactorScreen())),
  _Entry(Icons.devices, 'sessions.title', (c) => _open(c, const SessionsScreen())),
  _Entry(Icons.vpn_key, 'recovery.title', (c) => _open(c, const RecoverySetupScreen())),
  _Entry(Icons.verified_user, 'kt.title', (c) => _open(c, const KtScreen())),
  _Entry(Icons.verified, 'verify.title', (c) => _open(c, const VerifyScreen())),
];

/// Account tab: who you are, everything you own, locale, sign out.
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
          const _Header(),
          const SizedBox(height: 24),
          if (user != null && user.emailVerified == false) _VerifyBanner(email: user.email),
          if (user != null)
            _MenuTile(
              icon: Icons.workspace_premium,
              label: context.tr('achievements.cabinetTitle'),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => CabinetScreen(userId: user.id, name: user.name ?? user.email),
              )),
            ),
          for (final section in _sections) ...[
            for (final e in section)
              _MenuTile(
                icon: e.icon,
                label: context.tr(e.labelKey),
                onTap: () => e.open(context),
              ),
            const Divider(),
          ],
          for (final e in _security)
            _MenuTile(
              icon: e.icon,
              label: context.tr(e.labelKey),
              subtitle: e.labelKey == 'twofa.title' && user?.twoFactorEnabled == true
                  ? context.tr('twofa.enabled')
                  : null,
              onTap: () => e.open(context),
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

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.label, required this.onTap, this.subtitle});

  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icon),
        title: Text(label),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      );
}

class _Header extends ConsumerWidget {
  const _Header();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    final image = user?.image;
    final hasImage = image != null && image.isNotEmpty;
    return InkWell(
      onTap: user == null
          ? null
          : () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => const EditProfileScreen())),
      child: Column(
        children: [
          CircleAvatar(
            radius: 36,
            backgroundImage: hasImage
                ? NetworkImage(
                    image.startsWith('http') ? image : '${AppConfig.apiBase}$image')
                : null,
            child: hasImage
                ? null
                : Text((user?.name ?? user?.email ?? '?').characters.first.toUpperCase(),
                    style: const TextStyle(fontSize: 28)),
          ),
          const SizedBox(height: 12),
          Text(user?.name ?? user?.email ?? '', style: Theme.of(context).textTheme.titleLarge),
          if (user?.name != null) Text(user!.email, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          Text(context.tr('profile.editTitle'),
              style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 12)),
        ],
      ),
    );
  }
}

class _VerifyBanner extends ConsumerWidget {
  const _VerifyBanner({required this.email});
  final String email;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Card(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        color: Theme.of(context).colorScheme.errorContainer,
        child: ListTile(
          leading: const Icon(Icons.mark_email_unread),
          title: Text(context.tr('verifyEmail.title')),
          subtitle: Text(context.tr('verifyEmail.body')),
          trailing: TextButton(
            onPressed: () => runAction(
              context,
              () => ref.read(apiProvider).sendVerificationEmail(email),
              successKey: 'verifyEmail.sent',
            ),
            child: Text(context.tr('verifyEmail.resend')),
          ),
        ),
      );
}
