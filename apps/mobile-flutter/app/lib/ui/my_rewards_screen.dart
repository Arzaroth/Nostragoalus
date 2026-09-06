import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/empty_state.dart';
import 'widgets/panel.dart';

/// Rewards the user has earned across their leagues.
class MyRewardsScreen extends ConsumerWidget {
  const MyRewardsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rewards = ref.watch(meRewardsProvider);
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('rewards.title'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(meRewardsProvider.future),
        child: AsyncValueView<List<dynamic>>(
          value: rewards,
          onRetry: () => ref.invalidate(meRewardsProvider),
          data: (list) => list.isEmpty
              ? EmptyState(icon: Icons.emoji_events_outlined, message: context.tr('rewards.empty'))
              : ListView(
                  padding: const EdgeInsets.only(top: 4, bottom: 24),
                  children: [
                    Panel(
                      children: [
                        for (final r in list.cast<MeReward>())
                          PanelRow(
                            leading: Icon(
                                r.youHold ? Icons.emoji_events : Icons.emoji_events_outlined,
                                color: t.amber),
                            title: Text(r.reward.label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleSmall),
                            subtitle: Text(r.leagueName, maxLines: 1, overflow: TextOverflow.ellipsis),
                            trailing: r.youHold
                                ? Tag(context.tr('reward.holding'), color: t.emerald)
                                : null,
                          ),
                      ],
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
