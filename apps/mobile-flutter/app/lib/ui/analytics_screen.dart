import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';
import 'widgets/stat_tile.dart';

/// Personal prediction analytics (read-only headline stats).
class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analytics = ref.watch(analyticsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('analytics.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(analyticsProvider.future),
        child: AsyncValueView<AnalyticsResponse>(
          value: analytics,
          onRetry: () => ref.invalidate(analyticsProvider),
          data: (a) {
            if (!a.hasData) {
              return ListView(children: [
                const SizedBox(height: 80),
                Center(child: Text(context.tr('analytics.signInHint'))),
              ]);
            }
            return GridView.count(
              crossAxisCount: 2,
              padding: const EdgeInsets.all(12),
              childAspectRatio: 1.6,
              children: [
                StatTile(label: context.tr('analytics.picks'), value: '${a.totalPicks.toInt()}'),
                StatTile(label: context.tr('analytics.points'), value: '${a.totalPoints.toInt()}'),
                StatTile(
                    label: context.tr('analytics.avg'), value: a.avgPoints.toStringAsFixed(1)),
                StatTile(
                    label: context.tr('analytics.accuracy'),
                    value: '${(a.accuracy * 100).round()}%'),
                StatTile(
                    label: context.tr('analytics.exactRate'),
                    value: '${(a.exactRate * 100).round()}%'),
              ],
            );
          },
        ),
      ),
    );
  }
}
