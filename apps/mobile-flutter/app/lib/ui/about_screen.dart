import 'package:flutter/material.dart';

import '../i18n/i18n_scope.dart';
import '../theme/app_theme.dart';
import 'widgets/panel.dart';

/// Static about page - name, blurb, and the tech behind the app.
class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('about.title'))),
      body: ListView(
        padding: const EdgeInsets.only(top: 24, bottom: 24),
        children: [
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Image.asset('assets/icon/icon.png', height: 80),
            ),
          ),
          const SizedBox(height: 16),
          Center(child: Text('Nostragoalus', style: theme.textTheme.headlineMedium)),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(context.tr('landing.subtitle'),
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
          ),
          const SizedBox(height: 24),
          Panel(
            children: [
              PanelRow(
                leading: const Icon(Icons.phone_android_outlined),
                title: Text(context.tr('about.client')),
                subtitle: Text(context.tr('about.clientFlutter')),
              ),
              PanelRow(
                leading: const Icon(Icons.lock_outline),
                title: Text(context.tr('about.e2eeTitle')),
                subtitle: Text(context.tr('about.e2eeText')),
              ),
              PanelRow(
                leading: const Icon(Icons.public_outlined),
                title: Text(context.tr('about.website')),
                subtitle: const Text('goal.arzaroth.com'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
