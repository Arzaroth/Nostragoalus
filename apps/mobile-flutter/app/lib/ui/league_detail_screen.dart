import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../leagues/permissions.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'league_board_screen.dart';
import 'league_chat_screen.dart';
import 'league_settings_screen.dart';
import 'moderation_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/online_dot.dart';
import 'widgets/panel.dart';

/// A league's home: identity (name, competition, mode, invite code), the ways
/// in (board, chat, settings, moderation), then the members, invites, prizes
/// and the leave action, each on its own board.
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
          final theme = Theme.of(context);
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                title: Text(l.name),
                pinned: true,
                actions: [
                  IconButton(
                    icon: const Icon(Icons.chat_bubble_outline),
                    tooltip: context.tr('chat.roomTitle'),
                    onPressed: () => _openChat(context, l),
                  ),
                  IconButton(
                    icon: const Icon(Icons.leaderboard_outlined),
                    tooltip: context.tr('leagues.viewRankings'),
                    onPressed: () => _openBoard(context, l),
                  ),
                ],
              ),
              SliverList.list(children: [
                _Identity(league: l),
                Panel(
                  children: [
                    PanelRow(
                      leading: const Icon(Icons.leaderboard_outlined),
                      title: Text(context.tr('leagues.viewRankings')),
                      chevron: true,
                      onTap: () => _openBoard(context, l),
                    ),
                    PanelRow(
                      leading: const Icon(Icons.chat_bubble_outline),
                      title: Text(context.tr('chat.roomTitle')),
                      chevron: true,
                      onTap: () => _openChat(context, l),
                    ),
                    if (canManage)
                      PanelRow(
                        leading: const Icon(Icons.settings_outlined),
                        title: Text(context.tr('leagues.settings')),
                        chevron: true,
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => LeagueSettingsScreen(league: l),
                        )),
                      ),
                    if (canManage)
                      PanelRow(
                        leading: const Icon(Icons.gavel_outlined),
                        title: Text(context.tr('moderation.title')),
                        chevron: true,
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => ModerationScreen(leagueId: leagueId),
                        )),
                      ),
                  ],
                ),
                PanelHeading(
                  title: context.tr('leagues.members'),
                  trailing: '${res.members.length}',
                ),
                Panel(
                  children: [
                    for (final m in res.members)
                      PanelRow(
                        leading: _MemberAvatar(member: m),
                        title: Text(m.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall),
                        trailing: _memberTrailing(context, l, m, selfId),
                      ),
                  ],
                ),
                if (canManage) _InvitesSection(leagueId: leagueId),
                _RewardsSection(leagueId: leagueId),
                const SizedBox(height: 20),
                Panel(
                  children: [
                    PanelRow(
                      leading: Icon(Icons.logout, color: theme.colorScheme.error),
                      title: Text(context.tr('leagues.leave'),
                          style: TextStyle(color: theme.colorScheme.error)),
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
                  ],
                ),
                const SizedBox(height: 24),
              ]),
            ],
          );
        },
      ),
    );
  }

  void _openChat(BuildContext context, LeagueDetailResponseLeague l) =>
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => LeagueChatScreen(leagueId: leagueId, name: l.name),
      ));

  void _openBoard(BuildContext context, LeagueDetailResponseLeague l) =>
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => LeagueBoardScreen(leagueId: leagueId, name: l.name),
      ));

  static bool _hasMenu(RoleValue? actorRole, RoleValue targetRole) =>
      canKick(actorRole, targetRole) ||
      canChangeRole(actorRole, targetRole) ||
      canTransferOwnership(actorRole, targetRole);

  /// The role tag (owner in amber) and, when the viewer may act on this
  /// member, the actions menu.
  Widget? _memberTrailing(
      BuildContext context, LeagueDetailResponseLeague l, Member m, String? selfId) {
    final t = context.tokens;
    final showRole = m.role != RoleValue.member;
    final showMenu = m.userId != selfId && _hasMenu(l.role, m.role);
    if (!showRole && !showMenu) return null;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showRole)
          Tag(context.tr(roleLabelKey(m.role)), color: m.role == RoleValue.owner ? t.amber : null),
        if (showMenu) _MemberMenu(leagueId: l.id, member: m, actorRole: l.role),
      ],
    );
  }
}

/// The identity block: the name, the competition / mode / visibility / size
/// tags, the description, and the invite code as a scoreboard numeral.
class _Identity extends StatelessWidget {
  const _Identity({required this.league});
  final LeagueDetailResponseLeague league;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final l = league;
    final code = l.joinCode;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (l.competition != null)
                    Tag(l.competition!.name, color: theme.colorScheme.primary),
                  Tag(context.tr(modeLabelKey(l.mode)), icon: Icons.tune),
                  Tag(context.tr(visibilityLabelKey(l.visibility)),
                      icon: l.visibility == VisibilityValue.public
                          ? Icons.public_outlined
                          : Icons.lock_outline),
                  Tag('${l.memberCount.toInt()} ${context.tr('leagues.members')}',
                      icon: Icons.groups_outlined),
                ],
              ),
              if (l.description != null && l.description!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(l.description!, style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
              ],
            ],
          ),
        ),
        if (code != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Panel(
              children: [
                PanelRow(
                  leading: const Icon(Icons.vpn_key_outlined),
                  title: Text(code, style: t.score(24, color: theme.colorScheme.onSurface)),
                  subtitle: Text(context.tr('leagues.code')),
                  trailing: IconButton(
                    icon: const Icon(Icons.copy_outlined),
                    tooltip: context.tr('leagues.copyCode'),
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: code));
                      showToast(context, context.tr('common.copied'));
                    },
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// A member's avatar (image or condensed initial) with the presence dot.
class _MemberAvatar extends StatelessWidget {
  const _MemberAvatar({required this.member});
  final Member member;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final url = member.image;
    final initial = member.name.isEmpty ? '?' : member.name.characters.first.toUpperCase();
    return SizedBox(
      width: 36,
      height: 36,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: scheme.primaryContainer,
            foregroundImage: (url != null && url.startsWith('http')) ? NetworkImage(url) : null,
            child: Text(initial,
                style: TextStyle(
                    fontFamily: AppTheme.displayFamily,
                    fontSize: 17,
                    color: scheme.onPrimaryContainer,
                    fontWeight: FontWeight.w600)),
          ),
          PositionedDirectional(end: 0, bottom: 0, child: OnlineDot(userId: member.userId)),
        ],
      ),
    );
  }
}

/// Member actions, offering only what the server would accept from [actorRole]
/// (mirrors `server/utils/leagues/permissions.ts`).
class _MemberMenu extends ConsumerWidget {
  const _MemberMenu({required this.leagueId, required this.member, required this.actorRole});

  final String leagueId;
  final Member member;
  final RoleValue? actorRole;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiProvider);
    final canPromote = canChangeRole(actorRole, member.role);
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_horiz),
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
        if (canPromote && member.role == RoleValue.member)
          PopupMenuItem(value: 'promote', child: Text(context.tr('leagues.makeModerator'))),
        if (canPromote && member.role == RoleValue.moderator)
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
        final theme = Theme.of(context);
        final t = context.tokens;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PanelHeading(title: context.tr('leagues.prizes'), trailing: '${list.length}'),
            Panel(
              children: [
                for (final reward in list)
                  PanelRow(
                    leading: Icon(
                      reward.youHold ? Icons.emoji_events : Icons.emoji_events_outlined,
                      color: reward.youHold ? t.amber : (reward.disabled ? t.faint : null),
                    ),
                    title: Text(
                      reward.reward?.label ?? reward.type.wire,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall
                          ?.copyWith(color: reward.disabled ? t.faint : null),
                    ),
                    subtitle: Text(
                      reward.winners.isEmpty
                          ? context.tr('rewards.noWinner')
                          : reward.winners.map((w) => w.displayName).join(', '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: reward.youHold
                        ? Tag(context.tr('reward.holding'), color: t.emerald)
                        : null,
                    chevron: !reward.disabled,
                    onTap: reward.disabled
                        ? null
                        : () => _showRanking(context, ref, reward.type.wire,
                            reward.reward?.label ?? reward.type.wire),
                  ),
              ],
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
            final theme = Theme.of(context);
            final t = context.tokens;
            if (snap.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(apiMessage(context, snap.error!),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                ),
              );
            }
            if (!snap.hasData) {
              return const Center(
                  child: Padding(
                      padding: EdgeInsets.all(32),
                      child: CircularProgressIndicator(strokeWidth: 2.5)));
            }
            final rows = (snap.data!['rows'] as List?) ?? const <dynamic>[];
            return ListView(
              controller: controller,
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                  child: Text(label, style: theme.textTheme.headlineSmall),
                ),
                if (rows.isEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                    child: Text(context.tr('rewards.noWinner'),
                        style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                  ),
                for (final (i, r) in rows.cast<Map<String, dynamic>>().indexed) ...[
                  if (i > 0) const Hairline(indent: 20),
                  _RankingRow(
                    rank: (r['rank'] as num?)?.toInt() ?? 0,
                    name: (r['displayName'] ?? '').toString(),
                    value: (r['value'] as num?)?.toInt() ?? 0,
                    isViewer: r['isViewer'] == true,
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// One line of a prize ranking: rank, name (tinted and tagged when it is the
/// viewer), the criterion value.
class _RankingRow extends StatelessWidget {
  const _RankingRow({
    required this.rank,
    required this.name,
    required this.value,
    required this.isViewer,
  });
  final int rank;
  final String name;
  final int value;
  final bool isViewer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final t = context.tokens;
    final rankColor = switch (rank) {
      1 => t.gold,
      2 => t.silver,
      3 => t.bronze,
      _ => t.muted,
    };
    final body = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Row(
        children: [
          SizedBox(width: 36, child: Text('$rank', style: t.score(22, color: rankColor))),
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall),
                ),
                if (isViewer) ...[
                  const SizedBox(width: 8),
                  Tag(context.tr('leaderboard.you'), color: scheme.primary),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text('$value', style: t.score(22, color: scheme.onSurface)),
        ],
      ),
    );
    return isViewer
        ? ColoredBox(color: scheme.primary.withValues(alpha: 0.10), child: body)
        : body;
  }
}

class _InvitesSection extends ConsumerWidget {
  const _InvitesSection({required this.leagueId});
  final String leagueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invites = ref.watch(leagueInvitesProvider(leagueId));
    final theme = Theme.of(context);
    final t = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PanelHeading(
          title: context.tr('leagues.invites'),
          action: TextButton.icon(
            icon: const Icon(Icons.add, size: 18),
            label: Text(context.tr('leagues.newInvite')),
            onPressed: () => _createInvite(context, ref),
          ),
        ),
        AsyncValueView<LeagueInvitesResponse>(
          value: invites,
          onRetry: () => ref.invalidate(leagueInvitesProvider(leagueId)),
          data: (res) => Panel(
            children: [
              if (res.invites.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(context.tr('invites.empty'),
                      style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                ),
              for (final i in res.invites)
                PanelRow(
                  leading: const Icon(Icons.link),
                  title: Text(i.token,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.score(18, weight: FontWeight.w500, color: theme.colorScheme.onSurface)),
                  subtitle: Row(
                    children: [
                      Text(
                        '${i.uses.toInt()}${i.maxUses != null ? '/${i.maxUses!.toInt()}' : ''}',
                        style: t.score(14, weight: FontWeight.w600, color: t.muted),
                      ),
                      const SizedBox(width: 4),
                      Text(context.tr('invites.usesLabel')),
                    ],
                  ),
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
              const SizedBox(height: 12),
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
