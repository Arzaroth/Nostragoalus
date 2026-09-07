import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../live/live_frame_router.dart';
import '../live/live_service.dart';
import '../state/providers.dart';
import '../voice/voice_service.dart';
import '../chat/dm_providers.dart';
import 'account_screen.dart';
import 'chat_rooms_screen.dart';
import 'leaderboard_screen.dart';
import 'leagues_screen.dart';
import 'matches_screen.dart';
import 'onboarding_tour.dart';
import 'standings_screen.dart';
import 'widgets/app_nav_bar.dart';

/// How long an unanswered incoming ring stays on screen (matches the web's
/// RING_TIMEOUT_MS).
const _ringTimeout = Duration(seconds: 30);

/// The signed-in shell: one tab per top-level destination. IndexedStack keeps
/// each tab's scroll + query state alive when switching.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  StreamSubscription<LiveFrame>? _liveSub;
  AppLifecycleListener? _lifecycle;
  bool _tourChecked = false;
  BuildContext? _ringContext;
  String? _ringFrom;
  Timer? _ringTimer;
  bool _endedInBackground = false;
  // Captured in initState: riverpod rejects `ref` once the element is disposed,
  // and the socket still has to be closed from dispose().
  LiveService? _live;

  // Ordered by [HomeTab]; indexed by its `.index`.
  static const _screens = [
    MatchesScreen(),
    StandingsScreen(),
    LeaderboardScreen(),
    LeaguesScreen(),
    ChatRoomsScreen(),
    AccountScreen(),
  ];

  @override
  void initState() {
    super.initState();
    ref.read(leagueLensGuardProvider);
    final live = ref.read(liveServiceProvider)..connect();
    _live = live;
    // One hub socket for the whole app: the voice signaling multiplexes over it.
    ref.read(voiceServiceProvider).attach(live);
    _liveSub = live.frames.listen(_router.handle);
    _lifecycle = AppLifecycleListener(
      onPause: _onPaused,
      onRestart: _onResumed,
      onResume: _onResumed,
      onDetach: () => unawaited(ref.read(voiceServiceProvider).leave()),
    );
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
    _ringTimer?.cancel();
    _lifecycle?.dispose();
    _liveSub?.cancel();
    // The shell is only torn down on sign-out; a socket left open would stay
    // authenticated as the user who just signed out.
    _live?.disconnect();
    super.dispose();
  }

  // Server-pushed frames invalidate the reads they touch, so live scores,
  // notifications and reaction counts refresh without polling.
  late final LiveFrameRouter _router = LiveFrameRouter(
    onMatches: () => ref.invalidate(matchesProvider),
    onMatch: (id) => ref.invalidate(matchProvider(id)),
    onNotifications: () {
      ref.invalidate(notificationsProvider);
      // A DM raises a DM_MESSAGE notification, and this is the only frame that
      // announces one - without it the chat tab's unread badge would be a
      // snapshot taken when the shell mounted.
      ref.invalidate(dmThreadsProvider);
    },
    onReactions: (id) => ref.invalidate(reactionsProvider(id)),
    onViewers: (id, count) => ref.read(viewersProvider.notifier).state = {
      ...ref.read(viewersProvider),
      id: count,
    },
    onPresenceSnapshot: (users) => ref.read(presenceProvider.notifier).state = users,
    onPresence: (id, status) {
      final next = {...ref.read(presenceProvider)};
      if (status == null) {
        next.remove(id);
      } else {
        next[id] = status;
      }
      ref.read(presenceProvider.notifier).state = next;
    },
    onTyping: (league, who) => _markTyping(league, who),
    onDmTyping: (threadId, who) => _markTyping('dm:$threadId', who),
    onRing: (frame) => unawaited(_onIncomingCall(frame)),
    onRingCancelled: (from) {
      if (_ringFrom == from) _dismissRing();
    },
  );

  // One map for both rooms: the key is `<room>|<userId>`, where a room is a
  // leagueId or `dm:<threadId>`. Entries older than 10s are pruned on every write
  // so the map cannot outgrow the people currently typing.
  void _markTyping(String room, String who) {
    final now = DateTime.now();
    final next = {...ref.read(typingProvider)}
      ..removeWhere((_, at) => now.difference(at).inSeconds > 10)
      ..['$room|$who'] = now;
    ref.read(typingProvider.notifier).state = next;
  }

  // Backgrounded is the app's only idle signal, and it is what makes the amber
  // presence dot reachable at all (the server never infers idle by itself).
  //
  // It also ends any call, immediately: without a foreground service the OS
  // suspends the microphone as soon as the app leaves the foreground, so any
  // grace period would be a window in which the UI says "in call" over a dead
  // mic. Leaving is honest, and the user is told why on the way back.
  void _onPaused() {
    ref.read(liveServiceProvider).send({'type': 'presence:ping', 'active': false});
    unawaited(_endCallForBackground());
  }

  Future<void> _endCallForBackground() async {
    _endedInBackground = await ref.read(voiceServiceProvider).backgrounded();
  }

  void _onResumed() {
    ref.read(liveServiceProvider).send({'type': 'presence:ping', 'active': true});
    if (!_endedInBackground) return;
    _endedInBackground = false;
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(context.tr('voice.endedInBackground'))));
  }

  void _dismissRing() {
    _ringTimer?.cancel();
    _ringTimer = null;
    final sheet = _ringContext;
    _ringContext = null;
    _ringFrom = null;
    if (sheet != null && sheet.mounted) Navigator.pop(sheet);
  }

  /// An inbound voice:ring: show an accept/decline sheet. Accept joins the call
  /// scope; decline pushes voice:decline back over the hub socket. The sheet
  /// self-dismisses on the caller's voice:cancelled and on the ring timeout, so
  /// a caller who gives up cannot leave it on screen forever.
  Future<void> _onIncomingCall(LiveFrame frame) async {
    final scopeJson = frame['scope'];
    final from = frame['from'];
    // One ring at a time: a second concurrent invite would stack another modal
    // over this one with no way back to it.
    if (scopeJson is! Map || from is! String || _ringFrom != null) return;
    final scope = VoiceScope.fromJson(scopeJson.cast<String, dynamic>());
    final fromName = (frame['fromName'] ?? '').toString();
    _ringFrom = from;
    _ringTimer = Timer(_ringTimeout, _dismissRing);
    await showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      builder: (sheetContext) {
        _ringContext = sheetContext;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.call, size: 36, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 12),
                Text(
                    fromName.isEmpty
                        ? context.tr('voice.incoming')
                        : context.tr('voice.callingYou', {'name': fromName}),
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
                        ref.read(liveServiceProvider).send(
                            {'type': 'voice:decline', 'scope': scope.toJson(), 'to': from});
                        _dismissRing();
                      },
                    ),
                    FilledButton.icon(
                      icon: const Icon(Icons.call),
                      label: Text(context.tr('voice.accept')),
                      onPressed: () {
                        _dismissRing();
                        unawaited(_accept(scope));
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
    _ringContext = null;
    _ringFrom = null;
    _ringTimer?.cancel();
    _ringTimer = null;
  }

  Future<void> _accept(VoiceScope scope) async {
    try {
      await ref.read(voiceServiceProvider).join(scope);
    } on VoiceJoinException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(context.tr(e.micDenied ? 'voice.error.micDenied' : 'err.serverError')),
      ));
    }
  }

  static const _liveStatuses = {StatusValue.live, StatusValue.paused};

  void _resubscribe() {
    final live = ref.read(matchesProvider).maybeWhen(
          data: (res) =>
              res.matches.where((m) => _liveStatuses.contains(m.status)).map((m) => m.id).toSet(),
          orElse: () => <String>{},
        );
    final hub = ref.read(liveServiceProvider);
    hub.subscribe(live);
    // The viewed match rides its own frame: the server's "N watching now" is
    // built from `viewing` only, never from the subscribe set.
    hub.viewing(ref.read(viewedMatchProvider));
  }

  @override
  Widget build(BuildContext context) {
    // Keep the hub subscribed to the in-play matches, and told which one is open.
    ref.listen(matchesProvider, (_, __) => _resubscribe());
    ref.listen(viewedMatchProvider, (_, __) => _resubscribe());
    final tab = ref.watch(homeTabProvider);
    return Scaffold(
      body: IndexedStack(index: tab.index, children: _screens),
      // nav.tab.* rather than nav.*: six equal-width tabs leave ~60dp each, and
      // the header wording collides there (fr "Classement" for standings vs
      // "Classement joueurs" for the leaderboard, side by side).
      bottomNavigationBar: AppNavBar(
        selectedIndex: tab.index,
        onSelected: (i) => ref.read(homeTabProvider.notifier).state = HomeTab.values[i],
        items: [
          NavItem(
              icon: Icons.sports_soccer_outlined,
              activeIcon: Icons.sports_soccer,
              label: context.tr('nav.matches')),
          NavItem(
              icon: Icons.table_chart_outlined,
              activeIcon: Icons.table_chart,
              label: context.tr('nav.tab.standings')),
          NavItem(
              icon: Icons.leaderboard_outlined,
              activeIcon: Icons.leaderboard,
              label: context.tr('nav.tab.leaderboard')),
          NavItem(
              icon: Icons.groups_outlined,
              activeIcon: Icons.groups,
              label: context.tr('nav.leagues')),
          NavItem(
              icon: Icons.chat_bubble_outline,
              activeIcon: Icons.chat_bubble,
              label: context.tr('nav.chat')),
          NavItem(
              icon: Icons.person_outline,
              activeIcon: Icons.person,
              label: context.tr('nav.account')),
        ],
      ),
    );
  }
}
