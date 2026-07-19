import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'create_league_screen.dart';
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
    if (code == null || code.isEmpty || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final joined = context.tr('leagues.joined');
    final failed = context.tr('leagues.joinFailed');
    try {
      await ref.read(apiProvider).joinLeagueByCode(code);
      ref.invalidate(leaguesProvider);
      messenger.showSnackBar(SnackBar(content: Text(joined)));
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(failed)));
    }
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
                        onPressed: () async {
                          final messenger = ScaffoldMessenger.of(context);
                          final joined = context.tr('leagues.joined');
                          final failed = context.tr('leagues.joinFailed');
                          try {
                            await ref.read(apiProvider).joinLeague(l.id);
                            ref.invalidate(leaguesProvider);
                            messenger.showSnackBar(SnackBar(content: Text(joined)));
                          } catch (_) {
                            messenger.showSnackBar(SnackBar(content: Text(failed)));
                          }
                        },
                        child: Text(context.tr('leagues.join')),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}
