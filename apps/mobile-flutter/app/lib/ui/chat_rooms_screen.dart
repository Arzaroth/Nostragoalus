import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../chat/dm_providers.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'dm_inbox_screen.dart';
import 'home_shell.dart' show HomeTab;
import 'league_chat_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';

/// Every room the user can talk in: direct messages, then one row per league
/// in the selected competition. The web keeps chat one click away in a dock on
/// every page; mobile has no dock, so this is the top-level way in - league
/// chat was previously reachable only three taps deep, through a league.
class ChatRoomsScreen extends ConsumerWidget {
  const ChatRoomsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leagues = ref.watch(leaguesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.chat'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dmThreadsProvider);
          return ref.refresh(leaguesProvider.future);
        },
        child: AsyncValueView<LeaguesResponse>(
          value: leagues,
          onRetry: () => ref.invalidate(leaguesProvider),
          data: (res) => ListView(
            padding: const EdgeInsets.only(top: 4, bottom: 24),
            children: [
              Panel(children: [
                PanelRow(
                  leading: const Icon(Icons.forum_outlined),
                  title: Text(context.tr('dm.title')),
                  trailing: const _DmUnreadBadge(),
                  chevron: true,
                  onTap: () => Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const DmInboxScreen())),
                ),
              ]),
              PanelHeading(title: context.tr('chat.league.title')),
              if (res.leagues.isEmpty)
                // A section of this list, not the whole body, so it cannot be
                // an EmptyState - that widget is itself a ListView, and nesting
                // one here leaves the outer viewport unbounded.
                _NoLeagues(
                  onGo: () => ref.read(homeTabProvider.notifier).state = HomeTab.leagues,
                )
              else
                Panel(children: [
                  for (final l in res.leagues)
                    PanelRow(
                      leading: const Icon(Icons.chat_bubble_outline),
                      title: Text(l.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleSmall),
                      subtitle: Text(l.competition.name,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      chevron: true,
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => LeagueChatScreen(leagueId: l.id, name: l.name),
                      )),
                    ),
                ]),
            ],
          ),
        ),
      ),
    );
  }
}

/// The no-league section: nothing to talk in yet, and the way to fix it.
class _NoLeagues extends StatelessWidget {
  const _NoLeagues({required this.onGo});
  final VoidCallback onGo;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 24, 32, 32),
      child: Column(
        children: [
          Icon(Icons.groups_outlined, size: 36, color: t.faint),
          const SizedBox(height: 16),
          Text(context.tr('leagues.empty'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: t.muted)),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            icon: const Icon(Icons.groups_outlined),
            label: Text(context.tr('nav.leagues')),
            onPressed: onGo,
          ),
        ],
      ),
    );
  }
}

/// Total unread direct messages. Silent while loading or at zero, so the row
/// carries no badge until there is something to read.
class _DmUnreadBadge extends ConsumerWidget {
  const _DmUnreadBadge();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final threads = ref.watch(dmThreadsProvider).valueOrNull?.threads;
    if (threads == null) return const SizedBox.shrink();
    var unread = 0;
    for (final t in threads) {
      unread += t.unread.toInt();
    }
    if (unread <= 0) return const SizedBox.shrink();
    final t = context.tokens;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: t.amber, borderRadius: BorderRadius.circular(10)),
      child: Text('$unread',
          style: Theme.of(context)
              .textTheme
              .labelSmall
              ?.copyWith(color: Colors.black, fontWeight: FontWeight.w700)),
    );
  }
}
