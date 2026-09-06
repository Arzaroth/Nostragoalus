import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'league_detail_screen.dart';
import 'leagues_screen.dart' show joinLeague;
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';

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
    final theme = Theme.of(context);
    final t = context.tokens;
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
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.groups_outlined, size: 36, color: t.faint),
                          const SizedBox(height: 16),
                          Text(context.tr('invites.invitedTo'),
                              style: theme.textTheme.headlineSmall?.copyWith(color: t.muted)),
                          Text(name, style: theme.textTheme.displaySmall),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),
                    Panel(
                      margin: EdgeInsets.zero,
                      padding: const EdgeInsets.all(16),
                      dividers: false,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('$members', style: t.score(34, color: theme.colorScheme.onSurface)),
                            const SizedBox(width: 8),
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Text(context.tr('leagues.members'),
                                  style: theme.textTheme.labelMedium?.copyWith(color: t.muted)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
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
                                    height: 18,
                                    width: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2))
                                : Text(context.tr('leagues.joinButton')),
                          ),
                        if (already) ...[
                          const SizedBox(height: 8),
                          Text(context.tr('leagues.alreadyMember'),
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodySmall?.copyWith(color: t.muted)),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
