import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'widgets/async_value_view.dart';
import 'widgets/scorers_table.dart';

/// Competition golden-boot + assists leaders.
class ScorersScreen extends ConsumerWidget {
  const ScorersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scorers = ref.watch(scorersProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('nav.scorers')),
        actions: const [CompetitionSwitcher()],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(scorersProvider.future),
        child: AsyncValueView<ScorersResponse>(
          value: scorers,
          onRetry: () => ref.invalidate(scorersProvider),
          data: (res) => ScorersTable(scorers: res.scorers, assists: res.assists),
        ),
      ),
    );
  }
}
