import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n.dart';
import '../state/providers.dart';

const _localeNames = {
  'en': 'English',
  'fr': 'Français',
  'th': 'ไทย',
  'tlh': 'tlhIngan',
  'ar': 'العربية',
};

/// Switches the active UI locale. Changing it reloads [i18nProvider], which
/// rebuilds the whole app (including text direction) from the new strings.
class LocaleMenu extends ConsumerWidget {
  const LocaleMenu({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(localeProvider);
    return PopupMenuButton<Locale>(
      icon: const Icon(Icons.translate),
      tooltip: _localeNames[current.languageCode],
      onSelected: (l) => ref.read(localeProvider.notifier).state = l,
      itemBuilder: (context) => [
        for (final l in supportedLocales)
          PopupMenuItem(
            value: l,
            child: Row(
              children: [
                Icon(l == current ? Icons.check : Icons.language, size: 18),
                const SizedBox(width: 12),
                Text(_localeNames[l.languageCode] ?? l.languageCode),
              ],
            ),
          ),
      ],
    );
  }
}
