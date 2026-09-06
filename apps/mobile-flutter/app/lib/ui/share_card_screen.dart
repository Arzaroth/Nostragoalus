import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';

/// In-app viewer for a shared card link (analytics /a, profile /p, pick /s). Opens
/// from an inbound deep link; renders the card the token resolves to. Public -
/// works signed-out, like the web landing pages.
class ShareCardScreen extends ConsumerWidget {
  const ShareCardScreen({super.key, required this.kind, required this.token});
  final String kind; // 'a' | 'p' | 's'
  final String token;

  /// The fields each card kind carries (server/api/share/*), in display order,
  /// each with its own i18n key. Anything else the endpoint adds is not shown
  /// rather than labelled with an invented English name.
  static const _fields = <String, List<(String, String)>>{
    'a': [
      ('accuracyPct', 'share.field.accuracy'),
      ('exactPct', 'share.field.exactRate'),
      ('goalLean', 'share.field.goalLean'),
      ('homeBiasPct', 'share.field.homeBias'),
    ],
    'p': [
      ('rank', 'share.field.rank'),
      ('players', 'share.field.players'),
      ('totalPoints', 'share.field.points'),
      ('exact', 'share.field.exact'),
      ('trophies', 'share.field.trophies'),
      ('badges', 'share.field.badges'),
    ],
    's': [
      ('roundLabel', 'share.field.round'),
      ('group', 'share.field.group'),
      ('predicted', 'share.card.myCall'),
      ('actual', 'share.field.result'),
      ('tier', 'share.field.tier'),
      ('totalPoints', 'share.field.points'),
      ('isJoker', 'share.card.joker'),
      ('crowdSharePct', 'share.field.crowdShare'),
    ],
  };

  static final _numeric = RegExp(r'^[#+\-]?[\d.\-]+%?$');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final card = ref.watch(shareCardProvider((kind, token)));
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('share.cardTitle'))),
      body: AsyncValueView<Map<String, dynamic>>(
        value: card,
        onRetry: () => ref.invalidate(shareCardProvider((kind, token))),
        data: (c) {
          if (c.isEmpty) {
            return EmptyState(icon: Icons.link_off, message: context.tr('share.notFound'));
          }
          final title = (c['displayName'] ?? c['ownerName'] ?? '').toString();
          final subtitle = [
            if (kind == 's' && c['homeTeam'] != null) '${c['homeTeam']} v ${c['awayTeam']}',
            if (c['competitionName'] != null) c['competitionName'].toString(),
          ].join(' · ');
          final values = _values(c);
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
            children: [
              Center(
                child: Column(
                  children: [
                    Icon(Icons.share_outlined, size: 36, color: t.faint),
                    const SizedBox(height: 12),
                    Text(title, style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(subtitle, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Panel(
                margin: EdgeInsets.zero,
                children: [
                  for (final (field, labelKey) in _fields[kind] ?? const <(String, String)>[])
                    if (values[field] case final v?)
                      PanelRow(
                        title: Text(context.tr(labelKey)),
                        trailing: Text(v,
                            style: _numeric.hasMatch(v)
                                ? t.score(20, color: theme.colorScheme.onSurface)
                                : theme.textTheme.labelMedium),
                      ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  /// Formatted value per field name, null when the card omits it. The pick card
  /// splits each score across two keys; they are joined here.
  Map<String, String?> _values(Map<String, dynamic> c) => {
        for (final (field, _) in _fields[kind] ?? const <(String, String)>[])
          field: switch (field) {
            'predicted' => _score(c['predHome'], c['predAway']),
            'actual' => _score(c['actualHome'], c['actualAway']),
            _ => _fmt(c[field]),
          },
      };

  static String? _score(Object? home, Object? away) =>
      home is num && away is num ? '${home.toInt()}-${away.toInt()}' : null;

  static String? _fmt(Object? v) {
    if (v == null) return null;
    if (v is num) return v == v.roundToDouble() ? '${v.toInt()}' : v.toStringAsFixed(1);
    if (v is bool) return v ? '✓' : '✗';
    final s = v.toString();
    return s.isEmpty ? null : s;
  }
}
