import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/providers.dart';
import '../ui/join_league_screen.dart';
import '../ui/league_detail_screen.dart';
import '../ui/match_detail_screen.dart';
import '../ui/share_card_screen.dart';

/// Global navigator handle so inbound links can push without a Navigator
/// context of their own.
final navigatorKey = GlobalKey<NavigatorState>();

/// Subscribes to inbound app links (cold-start + while-running) and routes the
/// known `goal.arzaroth.com` paths to the matching screen. Only acts once a
/// user is signed in - every target needs auth - and otherwise drops the link.
class DeepLinkController extends ConsumerStatefulWidget {
  const DeepLinkController({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<DeepLinkController> createState() => _DeepLinkControllerState();
}

class _DeepLinkControllerState extends ConsumerState<DeepLinkController> {
  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = _appLinks.uriLinkStream.listen(_handle, onError: (_) {});
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handle(uri);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  void _handle(Uri uri) {
    // The SSO callback uses the custom scheme and is consumed by
    // flutter_web_auth_2; only route real https web links here.
    if (uri.scheme != 'http' && uri.scheme != 'https') return;
    final s = uri.pathSegments.where((e) => e.isNotEmpty).toList();
    if (s.isEmpty) return;
    // Share-card links (/a|/p|/s/<token>) are public - route even signed-out.
    final signedIn = ref.read(authControllerProvider).valueOrNull != null;
    final route = _routeFor(s, signedIn);
    if (route != null) navigatorKey.currentState?.push(route);
  }

  MaterialPageRoute<dynamic>? _routeFor(List<String> s, bool signedIn) {
    // /a|/p|/s/<token> -> public shared card viewer.
    if (s.length >= 2 && const {'a', 'p', 's'}.contains(s[0])) {
      return MaterialPageRoute(builder: (_) => ShareCardScreen(kind: s[0], token: s[1]));
    }
    if (!signedIn) return null; // everything below needs a session
    // /leagues/join/<token>
    if (s.length >= 3 && s[0] == 'leagues' && s[1] == 'join') {
      return MaterialPageRoute(builder: (_) => JoinLeagueScreen(token: s[2]));
    }
    // /leagues/<id>
    if (s.length >= 2 && s[0] == 'leagues') {
      return MaterialPageRoute(builder: (_) => LeagueDetailScreen(leagueId: s[1]));
    }
    // /<competition>/matches/<id>
    final m = s.indexOf('matches');
    if (m >= 0 && m + 1 < s.length) {
      return MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: s[m + 1]));
    }
    return null;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
