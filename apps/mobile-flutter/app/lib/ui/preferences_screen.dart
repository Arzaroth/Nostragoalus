import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';

/// User preferences (persisted server-side via better-auth update-user): show the
/// crowd/odds hints and the light/dark theme.
class PreferencesScreen extends ConsumerWidget {
  const PreferencesScreen({super.key});

  Future<void> _save(WidgetRef ref, Map<String, dynamic> prefs) async {
    await ref.read(apiProvider).updatePrefs(prefs);
    ref.invalidate(authControllerProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('prefs.title'))),
      body: ListView(
        children: [
          SwitchListTile(
            title: Text(context.tr('prefs.showCrowd')),
            value: user?.showCrowd ?? true,
            onChanged: (v) => _save(ref, {'showCrowd': v}),
          ),
          SwitchListTile(
            title: Text(context.tr('prefs.showOdds')),
            value: user?.showOdds ?? true,
            onChanged: (v) => _save(ref, {'showOdds': v}),
          ),
          const Divider(),
          ListTile(title: Text(context.tr('prefs.theme'))),
          RadioGroup<String>(
            groupValue: user?.theme ?? 'system',
            onChanged: (v) => _save(ref, {'theme': v == 'system' ? null : v}),
            child: Column(
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
