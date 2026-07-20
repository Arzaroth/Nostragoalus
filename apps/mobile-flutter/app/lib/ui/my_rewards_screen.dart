import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';

/// Rewards the user has earned across their leagues.
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
              ? EmptyState(message: context.tr('rewards.empty'))
              : ListView(
                  children: [
                    for (final r in list.cast<MeReward>())
                      ListTile(
                        leading: const Icon(Icons.card_giftcard, color: Colors.amber),
                        title: Text(r.reward.label),
                        subtitle: Text(r.leagueName),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}
