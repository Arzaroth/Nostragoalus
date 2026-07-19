import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'league_board_screen.dart';
import 'league_chat_screen.dart';
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
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                title: Text(l.name),
                pinned: true,
                actions: [
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
                    trailing: m.role != 'MEMBER' ? Text(m.role) : null,
                  ),
                if (canManage) _InvitesSection(leagueId: leagueId),
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
                ),
            ],
          ),
          orElse: () => const SizedBox.shrink(),
        ),
      ],
    );
  }
}
