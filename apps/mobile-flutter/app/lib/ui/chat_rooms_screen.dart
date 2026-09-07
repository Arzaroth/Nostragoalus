import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../chat/dm_providers.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'dm_inbox_screen.dart';
import 'league_chat_screen.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';

/// The rooms the user can talk in: direct messages, then one row per league in
/// the selected competition that has chat turned on. The web keeps chat one
/// click away in a dock on every page; mobile has no dock, so this is the
/// top-level way in - league chat was previously reachable only three taps deep,
/// through a league.
///
/// The competition switcher is in the app bar because the league rooms are
/// competition-scoped: without it, leagues in another tournament would have no
/// route from this tab at all.
class ChatRoomsScreen extends ConsumerWidget {
  const ChatRoomsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leagues = ref.watch(leaguesProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.chat')),
        actions: const [CompetitionSwitcher()],
      ),
      body: RefreshIndicator(
        // Both, or the spinner retracts while the badge this screen renders is
        // still in flight, and the count then changes after the gesture ended.
        onRefresh: () => Future.wait([
          ref.refresh(dmThreadsProvider.future),
          ref.refresh(leaguesProvider.future),
        ]),
        child: AsyncValueView<LeaguesResponse>(
          value: leagues,
          onRetry: () => ref.invalidate(leaguesProvider),
          // A league with chat off is not a room - opening it lands on a
          // disabled panel. The web dock filters the same way.
          data: (res) =>
              _rooms(context, ref, [for (final l in res.leagues) if (l.chatEnabled) l]),
        ),
      ),
    );
  }

  Widget _rooms(BuildContext context, WidgetRef ref, List<LeaguesResponseLeague> rooms) =>
      ListView(
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
          if (rooms.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(32, 24, 32, 32),
              child: EmptyStateBody(
                icon: Icons.groups_outlined,
                message: context.tr('leagues.empty'),
                action: OutlinedButton.icon(
                  icon: const Icon(Icons.groups_outlined),
                  label: Text(context.tr('nav.leagues')),
                  onPressed: () => ref.read(homeTabProvider.notifier).state = HomeTab.leagues,
                ),
              ),
            )
          else
            Panel(children: [
              for (final l in rooms)
                PanelRow(
                  leading: const Icon(Icons.chat_bubble_outline),
                  title: Text(l.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall),
                  chevron: true,
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => LeagueChatScreen(leagueId: l.id, name: l.name),
                  )),
                ),
            ]),
        ],
      );
}

/// Total unread direct messages, on the app's pill primitive so the count reads
/// the same here as in the inbox this row opens.
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
    return Tag('$unread', color: Theme.of(context).colorScheme.primary);
  }
}
