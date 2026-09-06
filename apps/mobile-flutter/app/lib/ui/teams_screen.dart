import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'competition_switcher.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';
import 'widgets/team_flag.dart';

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
            padding: const EdgeInsets.only(top: 4, bottom: 24),
            children: [
              if (res.teams.isNotEmpty)
                Panel(children: [
                  for (final t in res.teams)
                    PanelRow(
                      leading: TeamFlag(t.code, height: 20),
                      title: Text(t.name),
                      trailing: Text(t.code),
                    ),
                ]),
            ],
          ),
        ),
      ),
    );
  }
}
