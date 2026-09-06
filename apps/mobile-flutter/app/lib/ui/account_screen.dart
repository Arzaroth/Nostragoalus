import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
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
import 'widgets/panel.dart';
import 'widgets/section_card.dart';
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
final _profile = <_Entry>[
  _Entry(Icons.checklist_outlined, 'predictions.title', (c) => _open(c, const MyPredictionsScreen())),
  _Entry(Icons.query_stats_outlined, 'stats.title', (c) => _open(c, const MyStatsScreen())),
  _Entry(Icons.insights_outlined, 'analytics.title', (c) => _open(c, const AnalyticsScreen())),
  _Entry(Icons.compare_arrows_outlined, 'compare.title', (c) => _open(c, const CompareScreen())),
  _Entry(Icons.card_giftcard_outlined, 'rewards.title', (c) => _open(c, const MyRewardsScreen())),
  _Entry(Icons.emoji_events_outlined, 'nav.champion', (c) => _open(c, const ChampionScreen())),
  _Entry(Icons.sports_soccer_outlined, 'bestScorer.title', (c) => _open(c, const BestScorerScreen())),
  _Entry(Icons.auto_awesome_outlined, 'wrapped.title', (c) => _open(c, const WrappedScreen())),
  _Entry(Icons.forum_outlined, 'dm.title', (c) => _open(c, const DmInboxScreen())),
];

final _competition = <_Entry>[
  _Entry(Icons.account_tree_outlined, 'nav.bracket', (c) => _open(c, const BracketScreen())),
  _Entry(Icons.groups_3_outlined, 'nav.teams', (c) => _open(c, const TeamsScreen())),
  _Entry(Icons.public_outlined, 'nav.map', (c) => _open(c, const MapScreen())),
  _Entry(Icons.grid_view_outlined, 'nav.multiview', (c) => _open(c, const MultiviewScreen())),
  _Entry(Icons.smart_toy_outlined, 'bot.title', (c) => _open(c, const BotScreen())),
  _Entry(Icons.calendar_month_outlined, 'calendar.title', (c) => _open(c, const CalendarScreen())),
];

final _preferences = <_Entry>[
  _Entry(Icons.tune_outlined, 'prefs.title', (c) => _open(c, const PreferencesScreen())),
  _Entry(Icons.school_outlined, 'onboarding.takeTour', showOnboardingTour),
];

final _security = <_Entry>[
  _Entry(Icons.shield_outlined, 'twofa.title', (c) => _open(c, const TwoFactorScreen())),
  _Entry(Icons.devices_outlined, 'sessions.title', (c) => _open(c, const SessionsScreen())),
  _Entry(Icons.vpn_key_outlined, 'recovery.title', (c) => _open(c, const RecoverySetupScreen())),
  _Entry(Icons.verified_user_outlined, 'kt.title', (c) => _open(c, const KtScreen())),
  _Entry(Icons.verified_outlined, 'verify.title', (c) => _open(c, const VerifyScreen())),
];

final _about = <_Entry>[
  _Entry(Icons.map_outlined, 'nav.roadmap', (c) => _open(c, const RoadmapScreen())),
  _Entry(Icons.info_outlined, 'about.title', (c) => _open(c, const AboutScreen())),
];

/// Account tab: who you are, everything you own, locale, sign out.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    final t = context.tokens;
    List<Widget> rows(List<_Entry> entries) => [
          for (final e in entries)
            PanelRow(
              leading: Icon(e.icon),
              title: Text(context.tr(e.labelKey)),
              subtitle: e.labelKey == 'twofa.title' && user?.twoFactorEnabled == true
                  ? Text(context.tr('twofa.enabled'))
                  : null,
              chevron: true,
              onTap: () => e.open(context),
            ),
        ];
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.account')),
        actions: const [LocaleMenu()],
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: 8, bottom: 24),
        children: [
          const _Identity(),
          if (user != null && user.emailVerified == false) ...[
            const SizedBox(height: 12),
            _VerifyBanner(email: user.email),
          ],
          SectionCard(
            title: context.tr('account.profile'),
            children: [
              if (user != null)
                PanelRow(
                  leading: const Icon(Icons.workspace_premium_outlined),
                  title: Text(context.tr('achievements.cabinetTitle')),
                  chevron: true,
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => CabinetScreen(userId: user.id, name: user.name ?? user.email),
                  )),
                ),
              ...rows(_profile),
            ],
          ),
          SectionCard(title: context.tr('nav.competition'), children: rows(_competition)),
          SectionCard(title: context.tr('prefs.title'), children: rows(_preferences)),
          SectionCard(title: context.tr('account.title'), children: rows(_security)),
          SectionCard(title: context.tr('about.title'), children: rows(_about)),
          const SizedBox(height: 20),
          Panel(
            children: [
              PanelRow(
                leading: Icon(Icons.logout, color: t.live),
                title: Text(context.tr('nav.signOut'), style: TextStyle(color: t.live)),
                onTap: () => ref.read(authControllerProvider.notifier).signOut(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Who is signed in, leading the hub. Tapping it opens the profile editor.
class _Identity extends ConsumerWidget {
  const _Identity();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final image = user?.image;
    final hasImage = image != null && image.isNotEmpty;
    final title = user?.name ?? user?.email ?? '';
    return Panel(
      children: [
        InkWell(
          onTap: user == null
              ? null
              : () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const EditProfileScreen())),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: scheme.primaryContainer,
                  foregroundImage: hasImage
                      ? NetworkImage(image.startsWith('http') ? image : '${AppConfig.apiBase}$image')
                      : null,
                  child: Text(
                    (user?.name ?? user?.email ?? '?').characters.first.toUpperCase(),
                    style: t.score(26, weight: FontWeight.w600, color: scheme.onPrimaryContainer),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: theme.textTheme.headlineSmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      if (user?.name != null)
                        Text(user!.email,
                            style: theme.textTheme.bodySmall?.copyWith(color: t.muted),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Text(context.tr('profile.editTitle'),
                          style: theme.textTheme.labelMedium?.copyWith(color: scheme.primary)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, size: 20, color: t.faint),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _VerifyBanner extends ConsumerWidget {
  const _VerifyBanner({required this.email});
  final String email;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    return Panel(
      tint: t.amber.withValues(alpha: 0.12),
      children: [
        PanelRow(
          leading: Icon(Icons.mark_email_unread_outlined, color: t.amber),
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
      ],
    );
  }
}
