import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'league_detail_screen.dart';
import 'leagues_screen.dart' show joinLeague;
import 'widgets/async_value_view.dart';

/// Invite landing: previews the league behind a token, then joins on tap and
/// jumps into the league. Reached from an invite deep link or pasted token.
class JoinLeagueScreen extends ConsumerStatefulWidget {
  const JoinLeagueScreen({super.key, required this.token});
  final String token;
  @override
  ConsumerState<JoinLeagueScreen> createState() => _JoinLeagueScreenState();
}

class _JoinLeagueScreenState extends ConsumerState<JoinLeagueScreen> {
  bool _busy = false;

  Future<void> _join() async {
    setState(() => _busy = true);
    var leagueId = '';
    final joined = await joinLeague(context, () async {
      final res = await ref.read(apiProvider).acceptInvite(widget.token);
      ref.invalidate(leaguesProvider);
      leagueId = ((res['league'] as Map?)?['id'] ?? '').toString();
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (!joined) return;
    if (leagueId.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => LeagueDetailScreen(leagueId: leagueId)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('leagues.joinTitle'))),
      body: AsyncValueView<Map<String, dynamic>>(
        value: ref.watch(invitePreviewProvider(widget.token)),
        onRetry: () => ref.invalidate(invitePreviewProvider(widget.token)),
        data: (p) {
          final league = (p['league'] as Map?)?.cast<String, dynamic>() ?? const {};
          final name = (league['name'] ?? '').toString();
          final members = (league['memberCount'] as num?)?.toInt() ?? 0;
          final already = p['alreadyMember'] == true;
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.groups, size: 48),
                  const SizedBox(height: 12),
                  Text(name, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  Text('$members ${context.tr('leagues.members')}',
                      style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 24),
                  if (already)
                    FilledButton(
                      onPressed: () => Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                            builder: (_) =>
                                LeagueDetailScreen(leagueId: league['id'].toString())),
                      ),
                      child: Text(context.tr('leagues.open')),
                    )
                  else
                    FilledButton(
                      onPressed: _busy ? null : _join,
                      child: _busy
                          ? const SizedBox(
                              height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(context.tr('leagues.joinButton')),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
