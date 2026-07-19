import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// Rewards the user has earned across their leagues (raw - the endpoint is a
/// top-level array).
class MyRewardsScreen extends ConsumerWidget {
  const MyRewardsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rewards = ref.watch(meRewardsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('rewards.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(meRewardsProvider.future),
        child: AsyncValueView<List<dynamic>>(
          value: rewards,
          onRetry: () => ref.invalidate(meRewardsProvider),
          data: (list) => list.isEmpty
              ? Center(child: Text(context.tr('rewards.empty')))
              : ListView(
                  children: [
                    for (final raw in list)
                      Builder(builder: (context) {
                        final r = (raw as Map).cast<String, dynamic>();
                        final reward = (r['reward'] as Map?)?.cast<String, dynamic>();
                        return ListTile(
                          leading: const Icon(Icons.card_giftcard, color: Colors.amber),
                          title: Text((reward?['label'] ?? '').toString()),
                          subtitle: Text((r['leagueName'] ?? '').toString()),
                        );
                      }),
                  ],
                ),
        ),
      ),
    );
  }
}
