import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../live/live_service.dart';
import '../state/providers.dart';
import '../voice/voice_service.dart';
import 'account_screen.dart';
import 'leaderboard_screen.dart';
import 'leagues_screen.dart';
import 'matches_screen.dart';
import 'onboarding_tour.dart';
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
  bool _tourChecked = false;

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
    // Auto-start the one-time tour for a brand-new account (server flag null).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_tourChecked || !mounted) return;
      _tourChecked = true;
      final user = ref.read(authControllerProvider).valueOrNull;
      if (user != null && user.onboardingTourDismissedAt == null) {
        showOnboardingTour(context);
      }
    });
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
      case 'viewers:update':
        final id = frame['matchId'];
        final count = frame['count'];
        if (id is String && count is num) {
          ref.read(viewersProvider.notifier).state = {
            ...ref.read(viewersProvider),
            id: count.toInt(),
          };
        }
      case 'voice:ring':
        _onIncomingCall(frame);
    }
  }

  /// An inbound voice:ring: show an accept/decline sheet. Accept joins the call
  /// scope; decline pushes voice:decline back over the always-on socket.
  void _onIncomingCall(LiveFrame frame) {
    final scopeJson = frame['scope'];
    final from = frame['from'];
    if (scopeJson is! Map || from is! String) return;
    final scope = VoiceScope.fromJson(scopeJson.cast<String, dynamic>());
    final fromName = (frame['fromName'] ?? '').toString();
    showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.call, size: 40),
              const SizedBox(height: 12),
              Text(
                  fromName.isEmpty
                      ? context.tr('voice.incoming')
                      : context.tr('voice.callingYou').replaceAll('{name}', fromName),
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.error),
                    icon: const Icon(Icons.call_end),
                    label: Text(context.tr('voice.decline')),
                    onPressed: () {
                      ref.read(liveServiceProvider)
                          .send({'type': 'voice:decline', 'scope': scope.toJson(), 'to': from});
                      Navigator.pop(context);
                    },
                  ),
                  FilledButton.icon(
                    icon: const Icon(Icons.call),
                    label: Text(context.tr('voice.accept')),
                    onPressed: () {
                      ref.read(voiceServiceProvider).join(scope);
                      Navigator.pop(context);
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static const _liveStatuses = {'LIVE', 'PAUSED'};

  void _resubscribe() {
    final live = ref.read(matchesProvider).maybeWhen(
          data: (res) =>
              res.matches.where((m) => _liveStatuses.contains(m.status)).map((m) => m.id).toSet(),
          orElse: () => <String>{},
        );
    final viewed = ref.read(viewedMatchProvider);
    if (viewed != null) live.add(viewed);
    ref.read(liveServiceProvider).subscribe(live);
  }

  @override
  Widget build(BuildContext context) {
    // Keep the hub subscribed to the in-play matches plus the one being viewed.
    ref.listen(matchesProvider, (_, __) => _resubscribe());
    ref.listen(viewedMatchProvider, (_, __) => _resubscribe());
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
