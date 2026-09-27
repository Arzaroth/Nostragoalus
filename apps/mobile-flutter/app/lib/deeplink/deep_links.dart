import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../ui/feedback.dart';
import '../ui/join_league_screen.dart';
import '../ui/league_detail_screen.dart';
import '../ui/match_detail_screen.dart';
import '../ui/share_card_screen.dart';

/// Global navigator handle so inbound links can push without a Navigator
/// context of their own.
final navigatorKey = GlobalKey<NavigatorState>();

/// The platform link source, overridable so an on-device test can deliver a
/// link through the real handler.
final appLinksProvider = Provider<AppLinks?>((ref) => null);

/// The token of a mailed account-deletion link, or null for any other link.
String? deletionToken(Uri uri) {
  final s = uri.pathSegments.where((e) => e.isNotEmpty).toList();
  if (s.length != 4 || s[0] != 'api' || s[1] != 'auth' || s[2] != 'delete-user' || s[3] != 'callback') {
    return null;
  }
  final token = uri.queryParameters['token'];
  return token == null || token.isEmpty ? null : token;
}

/// The screen an inbound `goal.arzaroth.com` path maps to, or null when the path
/// is unknown or needs a session the visitor does not have. Share cards
/// (`/a|/p|/s/<token>`) are public; everything else is signed-in only.
MaterialPageRoute<dynamic>? deepLinkTarget(List<String> s, {required bool signedIn}) {
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
  if (s.length == 3 && s[1] == 'matches') {
    return MaterialPageRoute(builder: (_) => MatchDetailScreen(matchId: s[2]));
  }
  return null;
}

/// Subscribes to inbound app links (cold-start + while-running) and routes the
/// known `goal.arzaroth.com` paths to the matching screen. It waits for the
/// session to resolve first: on a cold start the auth controller is still
/// loading when the link arrives, and reading it early would drop every
/// signed-in target.
class DeepLinkController extends ConsumerStatefulWidget {
  const DeepLinkController({super.key, required this.child, this.links});
  final Widget child;

  /// Seam for tests: the real [AppLinks] needs a platform channel.
  final AppLinks? links;
  @override
  ConsumerState<DeepLinkController> createState() => _DeepLinkControllerState();
}

class _DeepLinkControllerState extends ConsumerState<DeepLinkController> {
  late final _appLinks = widget.links ?? ref.read(appLinksProvider) ?? AppLinks();
  StreamSubscription<Uri>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = _appLinks.uriLinkStream.listen(
      (uri) => unawaited(_handle(uri)),
      onError: (Object _) {},
    );
    unawaited(_handleInitial());
  }

  Future<void> _handleInitial() async {
    try {
      final uri = await _appLinks.getInitialLink();
      if (uri != null) await _handle(uri);
    } catch (_) {
      // A malformed or absent initial link is not worth surfacing.
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _handle(Uri uri) async {
    // Only real web links are routed here. The SSO callback is an https App Link
    // too, but the auth session consumes it before it is ever dispatched as a
    // link, and deepLinkTarget has no route for it either way.
    if (uri.scheme != 'http' && uri.scheme != 'https') return;
    final token = deletionToken(uri);
    if (token != null) return _confirmDeletion(token);
    final s = uri.pathSegments.where((e) => e.isNotEmpty).toList();
    if (s.isEmpty) return;
    bool signedIn;
    try {
      signedIn = await ref.read(authControllerProvider.future) != null;
    } catch (_) {
      signedIn = false;
    }
    if (!mounted) return;
    final route = deepLinkTarget(s, signedIn: signedIn);
    if (route != null) navigatorKey.currentState?.push(route);
  }

  /// The mailed deletion link, answered with this app's session. Without one
  /// (signed out, or signed in as someone else) the server refuses, and the
  /// message says what to do rather than echoing its "not found".
  Future<void> _confirmDeletion(String token) async {
    String message;
    try {
      await ref.read(authControllerProvider.future);
      await ref.read(authControllerProvider.notifier).confirmDeletion(token);
      // Whatever was pushed (the delete screen, typically) belonged to the
      // account that no longer exists; sign-in is the root underneath.
      navigatorKey.currentState?.popUntil((route) => route.isFirst);
      message = 'account.deletedToast';
    } catch (_) {
      message = 'account.deleteLinkFailed';
    }
    final context = navigatorKey.currentContext;
    if (!mounted || context == null || !context.mounted) return;
    showToast(context, context.tr(message));
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
