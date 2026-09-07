import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../i18n/i18n_scope.dart';
import '../theme/app_theme.dart';
import 'widgets/panel.dart';

/// Shown instead of the app once the server has answered 426: this build is
/// below the floor it will serve.
///
/// It replaces everything rather than sitting on top of it, because every route
/// answers 426 - a dismissible banner would leave the user tapping through
/// screens that cannot load. The app cannot install its own update: it was
/// sideloaded, so the new one arrives the same way this one did.
class UpdateRequiredScreen extends ConsumerWidget {
  const UpdateRequiredScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.system_update, size: 44, color: t.amber),
                const SizedBox(height: 20),
                Text(context.tr('appUpdate.requiredTitle'),
                    textAlign: TextAlign.center, style: theme.textTheme.titleLarge),
                const SizedBox(height: 12),
                Text(context.tr('appUpdate.requiredBody'),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                const SizedBox(height: 24),
                FilledButton.icon(
                  icon: const Icon(Icons.download_outlined),
                  label: Text(context.tr('appUpdate.download')),
                  onPressed: () => launchUrl(
                    Uri.parse('${AppConfig.webBase}/download/nostragoalus.apk'),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
                const SizedBox(height: 20),
                Tag('${context.tr('appUpdate.thisBuild')} ${AppConfig.appVersion}'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
