import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'widgets/panel.dart';
import 'widgets/section_card.dart';

/// User preferences (persisted server-side via better-auth update-user): show the
/// crowd/odds hints and the light/dark theme.
class PreferencesScreen extends ConsumerWidget {
  const PreferencesScreen({super.key});

  Future<void> _save(BuildContext context, WidgetRef ref, Map<String, dynamic> prefs) =>
      runAction(context, () async {
        await ref.read(apiProvider).updatePrefs(prefs);
        ref.invalidate(authControllerProvider);
      }, successKey: 'prefs.saved');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('prefs.title'))),
      body: ListView(
        padding: const EdgeInsets.only(top: 8, bottom: 24),
        children: [
          Panel(
            children: [
              SwitchListTile(
                secondary: const Icon(Icons.groups_outlined),
                title: Text(context.tr('prefs.showCrowd')),
                value: user?.showCrowd ?? true,
                onChanged: (v) => _save(context, ref, {'showCrowd': v}),
              ),
              SwitchListTile(
                secondary: const Icon(Icons.percent_outlined),
                title: Text(context.tr('prefs.showOdds')),
                value: user?.showOdds ?? true,
                onChanged: (v) => _save(context, ref, {'showOdds': v}),
              ),
            ],
          ),
          RadioGroup<String>(
            groupValue: user?.theme ?? 'system',
            onChanged: (v) => _save(context, ref, {'theme': v == 'system' ? null : v}),
            child: SectionCard(
              title: context.tr('prefs.theme'),
              children: [
                for (final opt in const ['system', 'light', 'dark'])
                  RadioListTile<String>(
                    value: opt,
                    title: Text(context.tr('prefs.theme_$opt')),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
