import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';

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
    final scheme = Theme.of(context).colorScheme;
    final t = context.tokens;
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
                Icon(l == current ? Icons.check : Icons.language_outlined,
                    size: 18, color: l == current ? scheme.primary : t.faint),
                const SizedBox(width: 12),
                Text(_localeNames[l.languageCode] ?? l.languageCode,
                    style: l == current ? const TextStyle(fontWeight: FontWeight.w600) : null),
              ],
            ),
          ),
      ],
    );
  }
}
