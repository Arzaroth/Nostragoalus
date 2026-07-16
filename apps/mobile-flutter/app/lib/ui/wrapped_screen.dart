import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';
import 'widgets/stat_tile.dart';

/// Tournament "wrapped" recap. The endpoint is a ready/not-ready union, read
/// raw; when not ready we show a waiting note.
class WrappedScreen extends ConsumerWidget {
  const WrappedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wrapped = ref.watch(wrappedProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('wrapped.title'))),
      body: AsyncValueView<Map<String, dynamic>>(
        value: wrapped,
        onRetry: () => ref.invalidate(wrappedProvider),
        data: (w) {
          if (w['ready'] != true) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(context.tr('wrapped.notReady'), textAlign: TextAlign.center),
              ),
            );
          }
          final totals = (w['totals'] as Map?)?.cast<String, dynamic>() ?? const {};
          num n(String k) => (totals[k] as num?) ?? 0;
          return GridView.count(
            crossAxisCount: 2,
            padding: const EdgeInsets.all(12),
            childAspectRatio: 1.6,
            children: [
              StatTile(
                  label: context.tr('analytics.points'), value: '${n('totalPoints').toInt()}'),
              StatTile(
                  label: context.tr('wrapped.exact'), value: '${n('exactCount').toInt()}'),
              StatTile(
                  label: context.tr('wrapped.rank'),
                  value: w['rank'] != null ? '#${(w['rank'] as num).toInt()}' : '-'),
            ],
          );
        },
      ),
    );
  }
}
