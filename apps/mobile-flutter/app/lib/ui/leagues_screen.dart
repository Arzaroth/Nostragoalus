import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'create_league_screen.dart';
import 'feedback.dart';
import 'league_detail_screen.dart';
import 'league_settings_screen.dart' show modeLabelKey;
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';

/// The user's leagues, with browse-public and join-by-code entry points.
class LeaguesScreen extends ConsumerWidget {
  const LeaguesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leagues = ref.watch(leaguesProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.leagues')),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: context.tr('leagues.create'),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const CreateLeagueScreen()),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _joinByCode(context, ref),
        icon: const Icon(Icons.vpn_key_outlined),
        label: Text(context.tr('leagues.join')),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(leaguesProvider.future),
        child: AsyncValueView<LeaguesResponse>(
          value: leagues,
          onRetry: () => ref.invalidate(leaguesProvider),
          data: (res) {
            if (res.leagues.isEmpty) {
              return EmptyState(
                icon: Icons.groups_outlined,
                message: context.tr('leagues.empty'),
                action: OutlinedButton.icon(
                  icon: const Icon(Icons.public_outlined),
                  label: Text(context.tr('leagues.browse')),
                  onPressed: () => _browse(context),
                ),
              );
            }
            return ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 96),
              children: [
                const _NudgeBanner(),
                Panel(children: [for (final l in res.leagues) _LeagueRow(l)]),
                const SizedBox(height: 12),
                Panel(
                  children: [
                    PanelRow(
                      leading: const Icon(Icons.public_outlined),
                      title: Text(context.tr('leagues.browse')),
                      chevron: true,
                      onTap: () => _browse(context),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  void _browse(BuildContext context) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _PublicLeagues()));

  Future<void> _joinByCode(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.tr('leagues.join')),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(labelText: context.tr('leagues.code')),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context), child: Text(context.tr('common.cancel'))),
          FilledButton(
              onPressed: () => Navigator.pop(context, controller.text.trim()),
              child: Text(context.tr('leagues.join'))),
        ],
      ),
    );
    controller.dispose();
    if (code == null || code.isEmpty || !context.mounted) return;
    await joinLeague(context, () async {
      await ref.read(apiProvider).joinLeagueByCode(code);
      ref.invalidate(leaguesProvider);
    });
  }
}

/// The one "join, then say what happened" path shared by the code, public and
/// invite entry points.
Future<bool> joinLeague(BuildContext context, Future<void> Function() action) =>
    runAction(context, action, successKey: 'leagues.joined');

/// One league on the board: name, competition and mode, the member count as a
/// scoreboard numeral.
class _LeagueRow extends StatelessWidget {
  const _LeagueRow(this.league);
  final LeaguesResponseLeague league;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return PanelRow(
      leading: const Icon(Icons.groups_outlined),
      title: Text(league.name,
          maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall),
      subtitle: Text('${league.competition.name} · ${context.tr(modeLabelKey(league.mode))}',
          maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('${league.memberCount.toInt()}',
              style: t.score(22, color: theme.colorScheme.onSurface)),
          Text(context.tr('leagues.members'),
              style: theme.textTheme.labelSmall?.copyWith(color: t.faint)),
        ],
      ),
      chevron: true,
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => LeagueDetailScreen(leagueId: league.id),
      )),
    );
  }
}

/// Prompts to finish picks in any league that still has open matches uncovered.
/// Silent when everything is complete (or the read errors/loads).
class _NudgeBanner extends ConsumerWidget {
  const _NudgeBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(leagueCompletenessProvider).valueOrNull;
    if (data == null) return const SizedBox.shrink();
    final needy = <(LeagueCompletenessResponseLeague, int)>[];
    for (final league in data.cast<LeagueCompletenessResponseLeague>()) {
      final open = league.summary.incomplete.toInt() + league.summary.missing.toInt();
      if (open > 0) needy.add((league, open));
    }
    if (needy.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Panel(
        tint: t.amber.withValues(alpha: 0.10),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Icon(Icons.notifications_active_outlined, size: 20, color: t.amber),
                const SizedBox(width: 10),
                Text(context.tr('nudge.title'), style: theme.textTheme.titleSmall),
              ],
            ),
          ),
          for (final (league, open) in needy)
            PanelRow(
              title: Text(league.name, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(context.tr('nudge.openCount', {'n': open})),
              trailing: Text('$open', style: t.score(22, color: t.amber)),
              chevron: true,
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => LeagueDetailScreen(leagueId: league.leagueId),
              )),
            ),
        ],
      ),
    );
  }
}

class _PublicLeagues extends ConsumerWidget {
  const _PublicLeagues();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pub = ref.watch(publicLeaguesProvider);
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('leagues.browse'))),
      body: AsyncValueView<PublicLeaguesResponse>(
        value: pub,
        onRetry: () => ref.invalidate(publicLeaguesProvider),
        data: (res) => res.leagues.isEmpty
            ? EmptyState(icon: Icons.public_outlined, message: context.tr('leagues.emptyPublic'))
            : ListView(
                padding: const EdgeInsets.only(top: 4, bottom: 24),
                children: [
                  Panel(
                    children: [
                      for (final l in res.leagues)
                        PanelRow(
                          leading: const Icon(Icons.groups_2_outlined),
                          title: Text(l.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleSmall),
                          subtitle: Row(
                            children: [
                              Text('${l.memberCount.toInt()}',
                                  style: t.score(15, weight: FontWeight.w600, color: t.muted)),
                              const SizedBox(width: 4),
                              Text(context.tr('leagues.members')),
                            ],
                          ),
                          trailing: TextButton(
                            onPressed: () => joinLeague(context, () async {
                              await ref.read(apiProvider).joinLeague(l.id);
                              ref.invalidate(leaguesProvider);
                            }),
                            child: Text(context.tr('leagues.join')),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}
