import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'league_board_screen.dart';
import 'league_chat_screen.dart';
import 'league_settings_screen.dart';
import 'widgets/async_value_view.dart';

/// A league's home: info, join code, members, invites, and the leave action;
/// links out to the board + chat.
class LeagueDetailScreen extends ConsumerWidget {
  const LeagueDetailScreen({super.key, required this.leagueId});
  final String leagueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(leagueDetailProvider(leagueId));
    return Scaffold(
      body: AsyncValueView<LeagueDetailResponse>(
        value: detail,
        onRetry: () => ref.invalidate(leagueDetailProvider(leagueId)),
        data: (res) {
          final l = res.league;
          final canManage = l.role == 'OWNER' || l.role == 'MODERATOR';
          final isOwner = l.role == 'OWNER';
          final selfId = ref.watch(authControllerProvider).valueOrNull?.id;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                title: Text(l.name),
                pinned: true,
                actions: [
                  if (canManage)
                    IconButton(
                      icon: const Icon(Icons.settings),
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => LeagueSettingsScreen(league: l),
                      )),
                    ),
                  IconButton(
                    icon: const Icon(Icons.chat),
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => LeagueChatScreen(leagueId: leagueId, name: l.name),
                    )),
                  ),
                  IconButton(
                    icon: const Icon(Icons.leaderboard),
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => LeagueBoardScreen(leagueId: leagueId, name: l.name),
                    )),
                  ),
                ],
              ),
              SliverList.list(children: [
                if (l.description != null && l.description!.isNotEmpty)
                  Padding(padding: const EdgeInsets.all(16), child: Text(l.description!)),
                Wrap(
                  spacing: 8,
                  children: [
                    Padding(
                        padding: const EdgeInsets.only(left: 16),
                        child: Chip(label: Text(l.mode))),
                    Chip(label: Text('${l.memberCount.toInt()} ${context.tr('leagues.members')}')),
                    Chip(label: Text(l.visibility)),
                  ],
                ),
                if (l.joinCode != null)
                  ListTile(
                    leading: const Icon(Icons.vpn_key),
                    title: Text(l.joinCode!, style: const TextStyle(fontFamily: 'monospace')),
                    subtitle: Text(context.tr('leagues.code')),
                    trailing: IconButton(
                      icon: const Icon(Icons.copy),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: l.joinCode!));
                        ScaffoldMessenger.of(context)
                            .showSnackBar(SnackBar(content: Text(context.tr('common.copied'))));
                      },
                    ),
                  ),
                const Divider(),
                _sectionHeader(context, context.tr('leagues.members')),
                for (final m in res.members)
                  ListTile(
                    leading: CircleAvatar(child: Text(m.name.characters.first.toUpperCase())),
                    title: Text(m.name),
                    trailing: (canManage && m.userId != selfId)
                        ? _memberMenu(context, ref, l.id, m, isOwner)
                        : (m.role != 'MEMBER' ? Text(m.role) : null),
                  ),
                if (canManage) _InvitesSection(leagueId: leagueId),
                _RewardsSection(leagueId: leagueId),
                const Divider(),
                ListTile(
                  leading: Icon(Icons.logout, color: Theme.of(context).colorScheme.error),
                  title: Text(context.tr('leagues.leave')),
                  onTap: () async {
                    final nav = Navigator.of(context);
                    await ref.read(apiProvider).leaveLeague(leagueId);
                    ref.invalidate(leaguesProvider);
                    nav.pop();
                  },
                ),
              ]),
            ],
          );
        },
      ),
    );
  }

  Widget _sectionHeader(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );

  Widget _memberMenu(
      BuildContext context, WidgetRef ref, String leagueId, Member m, bool isOwner) {
    final api = ref.read(apiProvider);
    void refresh() => ref.invalidate(leagueDetailProvider(leagueId));
    return PopupMenuButton<String>(
      onSelected: (v) async {
        switch (v) {
          case 'promote':
            await api.setMemberRole(leagueId, m.userId, 'MODERATOR');
          case 'demote':
            await api.setMemberRole(leagueId, m.userId, 'MEMBER');
          case 'transfer':
            await api.transferOwnership(leagueId, m.userId);
          case 'remove':
            await api.removeMember(leagueId, m.userId);
        }
        refresh();
      },
      itemBuilder: (context) => [
        if (m.role == 'MEMBER')
          PopupMenuItem(value: 'promote', child: Text(context.tr('leagues.makeModerator'))),
        if (m.role == 'MODERATOR')
          PopupMenuItem(value: 'demote', child: Text(context.tr('leagues.makeMember'))),
        if (isOwner)
          PopupMenuItem(value: 'transfer', child: Text(context.tr('leagues.transferOwnership'))),
        PopupMenuItem(value: 'remove', child: Text(context.tr('leagues.removeMember'))),
      ],
    );
  }
}

/// Per-league reward criteria; tap one to see its full ranking.
class _RewardsSection extends ConsumerWidget {
  const _RewardsSection({required this.leagueId});
  final String leagueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rewards = ref.watch(leagueRewardsProvider(leagueId));
    return rewards.maybeWhen(
      data: (list) {
        if (list.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Divider(),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(context.tr('leagues.prizes'),
                  style: Theme.of(context).textTheme.titleMedium),
            ),
            for (final raw in list.cast<Map>())
              Builder(builder: (context) {
                final type = (raw['type'] ?? '').toString();
                final reward = raw['reward'] as Map?;
                final label = (reward?['label'] ?? type).toString();
                final winners = (raw['winners'] as List?) ?? const [];
                final youHold = raw['youHold'] == true;
                final disabled = raw['disabled'] == true;
                return ListTile(
                  dense: true,
                  enabled: !disabled,
                  leading: Icon(youHold ? Icons.emoji_events : Icons.emoji_events_outlined,
                      color: youHold ? Colors.amber : null),
                  title: Text(label),
                  subtitle: winners.isEmpty
                      ? Text(context.tr('rewards.noWinner'))
                      : Text(winners
                          .cast<Map>()
                          .map((w) => (w['displayName'] ?? '').toString())
                          .join(', ')),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: disabled
                      ? null
                      : () => _showRanking(context, ref, leagueId, type, label),
                );
              }),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }

  Future<void> _showRanking(
      BuildContext context, WidgetRef ref, String leagueId, String type, String label) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (context, controller) => FutureBuilder<Map<String, dynamic>>(
          future: ref.read(apiProvider).rewardRanking(leagueId, type),
          builder: (context, snap) {
            if (!snap.hasData) {
              return const Center(child: Padding(
                padding: EdgeInsets.all(32), child: CircularProgressIndicator()));
            }
            final rows = (snap.data!['rows'] as List?) ?? const [];
            return ListView(
              controller: controller,
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(label, style: Theme.of(context).textTheme.titleLarge),
                ),
                if (rows.isEmpty)
                  Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(context.tr('rewards.noWinner'))),
                for (final r in rows.cast<Map>())
                  ListTile(
                    dense: true,
                    leading: Text('${(r['rank'] as num?)?.toInt() ?? 0}'),
                    title: Text((r['displayName'] ?? '').toString(),
                        style: r['isViewer'] == true
                            ? const TextStyle(fontWeight: FontWeight.bold)
                            : null),
                    trailing: Text('${(r['value'] as num?)?.toInt() ?? 0}'),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _InvitesSection extends ConsumerWidget {
  const _InvitesSection({required this.leagueId});
  final String leagueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invites = ref.watch(leagueInvitesProvider(leagueId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: [
              Text(context.tr('leagues.invites'),
                  style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              TextButton.icon(
                icon: const Icon(Icons.add),
                label: Text(context.tr('leagues.newInvite')),
                onPressed: () async {
                  await ref.read(apiProvider).createInvite(leagueId, expiresInHours: 168, maxUses: 25);
                  ref.invalidate(leagueInvitesProvider(leagueId));
                },
              ),
            ],
          ),
        ),
        invites.maybeWhen(
          data: (res) => Column(
            children: [
              for (final i in res.invites)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.link),
                  title: Text(i.token, style: const TextStyle(fontFamily: 'monospace')),
                  subtitle: Text('${i.uses.toInt()}${i.maxUses != null ? '/${i.maxUses!.toInt()}' : ''}'),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    tooltip: context.tr('common.delete'),
                    onPressed: () async {
                      await ref.read(apiProvider).deleteInvite(leagueId, i.id);
                      ref.invalidate(leagueInvitesProvider(leagueId));
                    },
                  ),
                ),
            ],
          ),
          orElse: () => const SizedBox.shrink(),
        ),
      ],
    );
  }
}
