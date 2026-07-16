import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../live/live_service.dart';
import '../state/providers.dart';
import 'account_screen.dart';
import 'leaderboard_screen.dart';
import 'leagues_screen.dart';
import 'matches_screen.dart';
import 'standings_screen.dart';

/// The signed-in shell: four tabs over the MVP loop. IndexedStack keeps each
/// tab's scroll + query state alive when switching.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;
  StreamSubscription<LiveFrame>? _liveSub;

  static const _screens = [
    MatchesScreen(),
    StandingsScreen(),
    LeaderboardScreen(),
    LeaguesScreen(),
    AccountScreen(),
  ];

  @override
  void initState() {
    super.initState();
    final live = ref.read(liveServiceProvider)..connect();
    _liveSub = live.frames.listen(_onFrame);
  }

  @override
  void dispose() {
    _liveSub?.cancel();
    super.dispose();
  }

  // Server-pushed frames invalidate the reads they touch, so live scores,
  // notifications and reaction counts refresh without polling.
  void _onFrame(LiveFrame frame) {
    switch (frame['type']) {
      case 'match:update':
      case 'scores:changed':
        ref.invalidate(matchesProvider);
        final id = frame['matchId'];
        if (id is String) ref.invalidate(matchProvider(id));
      case 'notification:new':
        ref.invalidate(notificationsProvider);
      case 'reaction:update':
        final id = frame['matchId'];
        if (id is String) ref.invalidate(reactionsProvider(id));
    }
  }

  static const _liveStatuses = {'LIVE', 'PAUSED'};

  @override
  Widget build(BuildContext context) {
    // Keep the hub subscribed to whatever matches are currently in-play.
    ref.listen(matchesProvider, (_, next) {
      next.whenData((res) => ref.read(liveServiceProvider).subscribe(
            res.matches.where((m) => _liveStatuses.contains(m.status)).map((m) => m.id).toSet(),
          ));
    });
    return Scaffold(
      body: IndexedStack(index: _tab, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(
              icon: const Icon(Icons.sports_soccer), label: context.tr('nav.matches')),
          NavigationDestination(
              icon: const Icon(Icons.table_chart), label: context.tr('nav.standings')),
          NavigationDestination(
              icon: const Icon(Icons.leaderboard), label: context.tr('nav.leaderboard')),
          NavigationDestination(
              icon: const Icon(Icons.groups), label: context.tr('nav.leagues')),
          NavigationDestination(
              icon: const Icon(Icons.person), label: context.tr('nav.account')),
        ],
      ),
    );
  }
}
