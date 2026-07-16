import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import 'account_screen.dart';
import 'leaderboard_screen.dart';
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

  static const _screens = [
    MatchesScreen(),
    StandingsScreen(),
    LeaderboardScreen(),
    AccountScreen(),
  ];

  @override
  Widget build(BuildContext context) {
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
              icon: const Icon(Icons.person), label: context.tr('nav.account')),
        ],
      ),
    );
  }
}
