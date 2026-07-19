import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'widgets/async_value_view.dart';

/// The competition's teams.
class TeamsScreen extends ConsumerWidget {
  const TeamsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final teams = ref.watch(teamsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.teams')), actions: const [CompetitionSwitcher()]),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(teamsProvider.future),
        child: AsyncValueView<TeamsResponse>(
          value: teams,
          onRetry: () => ref.invalidate(teamsProvider),
          data: (res) => ListView(
            children: [
              for (final t in res.teams)
                ListTile(
                  leading: CircleAvatar(child: Text(t.code)),
                  title: Text(t.name),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
