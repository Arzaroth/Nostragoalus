import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'create_league_screen.dart';
import 'feedback.dart';
import 'league_detail_screen.dart';
import 'widgets/async_value_view.dart';

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
        icon: const Icon(Icons.vpn_key),
        label: Text(context.tr('leagues.join')),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(leaguesProvider.future),
        child: AsyncValueView<LeaguesResponse>(
          value: leagues,
          onRetry: () => ref.invalidate(leaguesProvider),
          data: (res) => ListView(
            children: [
              const _NudgeBanner(),
              for (final l in res.leagues)
                ListTile(
                  leading: const Icon(Icons.groups),
                  title: Text(l.name),
                  subtitle: Text('${l.competition.name} · ${l.memberCount.toInt()}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => LeagueDetailScreen(leagueId: l.id),
                  )),
                ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.public),
                title: Text(context.tr('leagues.browse')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => const _PublicLeagues())),
              ),
            ],
          ),
        ),
      ),
    );
  }

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
    return Card(
      margin: const EdgeInsets.all(12),
      color: Theme.of(context).colorScheme.tertiaryContainer,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              children: [
                const Icon(Icons.notifications_active),
                const SizedBox(width: 8),
                Text(context.tr('nudge.title'),
                    style: Theme.of(context).textTheme.titleSmall),
              ],
            ),
          ),
          for (final (league, open) in needy)
            ListTile(
              dense: true,
              title: Text(league.name),
              subtitle: Text(context.tr('nudge.openCount', {'n': open})),
              trailing: const Icon(Icons.chevron_right),
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
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('leagues.browse'))),
      body: AsyncValueView<PublicLeaguesResponse>(
        value: pub,
        onRetry: () => ref.invalidate(publicLeaguesProvider),
        data: (res) => res.leagues.isEmpty
            ? Center(child: Text(context.tr('leagues.emptyPublic')))
            : ListView(
                children: [
                  for (final l in res.leagues)
                    ListTile(
                      leading: const Icon(Icons.groups_2),
                      title: Text(l.name),
                      subtitle: Text('${l.memberCount.toInt()}'),
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
      ),
    );
  }
}
