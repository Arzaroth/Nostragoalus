import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// In-app viewer for a shared card link (analytics /a, profile /p, pick /s). Opens
/// from an inbound deep link; renders the card the token resolves to. Public -
/// works signed-out, like the web landing pages.
class ShareCardScreen extends ConsumerWidget {
  const ShareCardScreen({super.key, required this.kind, required this.token});
  final String kind; // 'a' | 'p' | 's'
  final String token;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final card = ref.watch(shareCardProvider((kind, token)));
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('share.cardTitle'))),
      body: AsyncValueView<Map<String, dynamic>>(
        value: card,
        onRetry: () => ref.invalidate(shareCardProvider((kind, token))),
        data: (c) {
          if (c.isEmpty) return Center(child: Text(context.tr('share.notFound')));
          final title = (c['displayName'] ?? c['ownerName'] ?? '').toString();
          final subtitle = (c['competitionName'] ?? '').toString();
          // Headline fields already surfaced above; show the rest as rows.
          const shown = {'displayName', 'ownerName', 'competitionName'};
          final rows = c.entries.where((e) => !shown.contains(e.key) && e.value != null).toList();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: Column(
                  children: [
                    const Icon(Icons.share, size: 40),
                    const SizedBox(height: 8),
                    Text(title, style: Theme.of(context).textTheme.headlineSmall),
                    if (subtitle.isNotEmpty)
                      Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Card(
                child: Column(
                  children: [
                    for (final e in rows)
                      ListTile(
                        dense: true,
                        title: Text(_humanise(e.key)),
                        trailing: Text(_fmt(e.value)),
                      ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  String _humanise(String k) {
    final s = k.replaceAllMapped(RegExp('([A-Z])'), (m) => ' ${m[1]!.toLowerCase()}');
    return s.isEmpty ? k : '${s[0].toUpperCase()}${s.substring(1)}';
  }

  String _fmt(dynamic v) {
    if (v is num) return v == v.roundToDouble() ? '${v.toInt()}' : v.toStringAsFixed(1);
    if (v is bool) return v ? '✓' : '✗';
    return v.toString();
  }
}
