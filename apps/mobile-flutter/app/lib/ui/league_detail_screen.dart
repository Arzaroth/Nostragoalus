import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../leagues/permissions.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'league_board_screen.dart';
import 'league_chat_screen.dart';
import 'league_settings_screen.dart';
import 'moderation_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/online_dot.dart';

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
          final canManage = canManageLeague(l.role);
          final selfId = ref.watch(authControllerProvider).valueOrNull?.id;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                title: Text(l.name),
                pinned: true,
                actions: [
                  if (canManage)
                    IconButton(
                      icon: const Icon(Icons.gavel),
                      tooltip: context.tr('moderation.title'),
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => ModerationScreen(leagueId: leagueId),
                      )),
                    ),
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
                        child: Chip(label: Text(context.tr(modeLabelKey(l.mode))))),
                    Chip(label: Text('${l.memberCount.toInt()} ${context.tr('leagues.members')}')),
                    Chip(label: Text(context.tr(visibilityLabelKey(l.visibility)))),
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
                        showToast(context, context.tr('common.copied'));
                      },
                    ),
                  ),
                const Divider(),
                _sectionHeader(context, context.tr('leagues.members')),
                for (final m in res.members)
                  ListTile(
                    leading: Stack(
                      children: [
                        CircleAvatar(child: Text(m.name.characters.first.toUpperCase())),
                        Positioned(right: 0, bottom: 0, child: OnlineDot(userId: m.userId)),
                      ],
                    ),
                    title: Text(m.name),
                    trailing: (m.userId != selfId && _hasMenu(l.role, m.role))
                        ? _MemberMenu(leagueId: l.id, member: m, actorRole: l.role)
                        : (m.role != 'MEMBER' ? Text(context.tr(roleLabelKey(m.role))) : null),
                  ),
                if (canManage) _InvitesSection(leagueId: leagueId),
                _RewardsSection(leagueId: leagueId),
                const Divider(),
                ListTile(
                  leading: Icon(Icons.logout, color: Theme.of(context).colorScheme.error),
                  title: Text(context.tr('leagues.leave')),
                  onTap: () async {
                    final ok = await confirmDialog(
                      context,
                      title: context.tr('leagues.leave'),
                      message: context.tr('leagues.leaveConfirm'),
                      confirmLabel: context.tr('leagues.leave'),
                    );
                    if (!ok || !context.mounted) return;
                    final nav = Navigator.of(context);
                    final left = await runAction(context, () async {
                      await ref.read(apiProvider).leaveLeague(leagueId);
                      ref.invalidate(leaguesProvider);
                    });
                    if (left) nav.pop();
                  },
                ),
              ]),
            ],
          );
        },
      ),
    );
  }

  static bool _hasMenu(String? actorRole, String targetRole) =>
      canKick(actorRole, targetRole) ||
      canChangeRole(actorRole, targetRole) ||
      canTransferOwnership(actorRole, targetRole);

  Widget _sectionHeader(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}

/// Member actions, offering only what the server would accept from [actorRole]
/// (mirrors `server/utils/leagues/permissions.ts`).
class _MemberMenu extends ConsumerWidget {
  const _MemberMenu({required this.leagueId, required this.member, required this.actorRole});

  final String leagueId;
  final Member member;
  final String? actorRole;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiProvider);
    final canPromote = canChangeRole(actorRole, member.role);
    return PopupMenuButton<String>(
      onSelected: (v) async {
        final confirmKey = v == 'remove'
            ? 'leagues.kickConfirm'
            : (v == 'transfer' ? 'leagues.transferConfirm' : null);
        if (confirmKey != null) {
          final ok = await confirmDialog(
            context,
            title: context.tr(v == 'remove' ? 'leagues.removeMember' : 'leagues.transferOwnership'),
            message: context.tr(confirmKey, {'name': member.name}),
            confirmLabel: context.tr('common.confirm'),
          );
          if (!ok || !context.mounted) return;
        }
        await runAction(context, () async {
          switch (v) {
            case 'promote':
              await api.setMemberRole(leagueId, member.userId, 'MODERATOR');
            case 'demote':
              await api.setMemberRole(leagueId, member.userId, 'MEMBER');
            case 'transfer':
              await api.transferOwnership(leagueId, member.userId);
            case 'remove':
              await api.removeMember(leagueId, member.userId);
          }
          ref.invalidate(leagueDetailProvider(leagueId));
        });
      },
      itemBuilder: (context) => [
        if (canPromote && member.role == 'MEMBER')
          PopupMenuItem(value: 'promote', child: Text(context.tr('leagues.makeModerator'))),
        if (canPromote && member.role == 'MODERATOR')
          PopupMenuItem(value: 'demote', child: Text(context.tr('leagues.makeMember'))),
        if (canTransferOwnership(actorRole, member.role))
          PopupMenuItem(value: 'transfer', child: Text(context.tr('leagues.transferOwnership'))),
        if (canKick(actorRole, member.role))
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
    return AsyncValueView<List<dynamic>>(
      value: ref.watch(leagueRewardsProvider(leagueId)),
      onRetry: () => ref.invalidate(leagueRewardsProvider(leagueId)),
      data: (raw) {
        final list = raw.cast<LeagueReward>();
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
            for (final reward in list)
              ListTile(
                dense: true,
                enabled: !reward.disabled,
                leading: Icon(
                    reward.youHold ? Icons.emoji_events : Icons.emoji_events_outlined,
                    color: reward.youHold ? Colors.amber : null),
                title: Text(reward.reward?.label ?? reward.type),
                subtitle: reward.winners.isEmpty
                    ? Text(context.tr('rewards.noWinner'))
                    : Text(reward.winners.map((w) => w.displayName).join(', ')),
                trailing: const Icon(Icons.chevron_right),
                onTap: reward.disabled
                    ? null
                    : () => _showRanking(context, ref, reward.type,
                        reward.reward?.label ?? reward.type),
              ),
          ],
        );
      },
    );
  }

  Future<void> _showRanking(
      BuildContext context, WidgetRef ref, String type, String label) async {
    // Built once, outside the sheet builder: a DraggableScrollableSheet rebuilds
    // on every drag frame and would otherwise re-fire the request each time.
    final ranking = ref.read(apiProvider).rewardRanking(leagueId, type);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (context, controller) => FutureBuilder<Map<String, dynamic>>(
          future: ranking,
          builder: (context, snap) {
            if (snap.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(apiMessage(context, snap.error!)),
                ),
              );
            }
            if (!snap.hasData) {
              return const Center(
                  child: Padding(
                      padding: EdgeInsets.all(32), child: CircularProgressIndicator()));
            }
            final rows = (snap.data!['rows'] as List?) ?? const <dynamic>[];
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
                for (final r in rows.cast<Map<String, dynamic>>())
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
                onPressed: () => _createInvite(context, ref),
              ),
            ],
          ),
        ),
        AsyncValueView<LeagueInvitesResponse>(
          value: invites,
          onRetry: () => ref.invalidate(leagueInvitesProvider(leagueId)),
          data: (res) => Column(
            children: [
              for (final i in res.invites)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.link),
                  title: Text(i.token, style: const TextStyle(fontFamily: 'monospace')),
                  subtitle: Text(
                      '${i.uses.toInt()}${i.maxUses != null ? '/${i.maxUses!.toInt()}' : ''}'),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    tooltip: context.tr('common.delete'),
                    onPressed: () async {
                      await runAction(context, () async {
                        await ref.read(apiProvider).deleteInvite(leagueId, i.id);
                        ref.invalidate(leagueInvitesProvider(leagueId));
                      });
                    },
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  /// Same coarse presets as the web dialog: an expiry and a use limit, both
  /// defaulting the way the web does (7 days, unlimited uses).
  Future<void> _createInvite(BuildContext context, WidgetRef ref) async {
    var expiresInHours = 168;
    int? maxUses;
    final create = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(ctx.tr('invites.title')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int>(
                initialValue: expiresInHours,
                decoration: InputDecoration(labelText: ctx.tr('invites.expiryLabel')),
                items: [
                  DropdownMenuItem(value: 24, child: Text(ctx.tr('invites.expiry.h24'))),
                  DropdownMenuItem(value: 168, child: Text(ctx.tr('invites.expiry.d7'))),
                  DropdownMenuItem(value: 720, child: Text(ctx.tr('invites.expiry.d30'))),
                ],
                onChanged: (v) => setLocal(() => expiresInHours = v ?? expiresInHours),
              ),
              DropdownButtonFormField<int?>(
                initialValue: maxUses,
                decoration: InputDecoration(labelText: ctx.tr('invites.usesLabel')),
                items: [
                  DropdownMenuItem(value: null, child: Text(ctx.tr('invites.uses.unlimited'))),
                  for (final n in const [1, 5, 25])
                    DropdownMenuItem(value: n, child: Text('$n')),
                ],
                onChanged: (v) => setLocal(() => maxUses = v),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.tr('common.cancel'))),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.tr('invites.create'))),
          ],
        ),
      ),
    );
    if (create != true || !context.mounted) return;
    await runAction(context, () async {
      await ref
          .read(apiProvider)
          .createInvite(leagueId, expiresInHours: expiresInHours, maxUses: maxUses);
      ref.invalidate(leagueInvitesProvider(leagueId));
    });
  }
}
