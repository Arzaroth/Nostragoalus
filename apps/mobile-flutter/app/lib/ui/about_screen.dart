import 'package:flutter/material.dart';

import '../i18n/i18n_scope.dart';

/// Static about page - name, blurb, and the tech behind the app.
class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('about.title'))),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Image.asset('assets/icon/icon.png', height: 80),
          const SizedBox(height: 16),
          Center(
            child: Text('Nostragoalus', style: Theme.of(context).textTheme.headlineMedium),
          ),
          const SizedBox(height: 8),
          Center(child: Text(context.tr('landing.subtitle'), textAlign: TextAlign.center)),
          const Divider(height: 40),
          ListTile(
            leading: const Icon(Icons.phone_android),
            title: Text(context.tr('about.client')),
            subtitle: const Text('Flutter (native Android)'),
          ),
          const ListTile(
            leading: Icon(Icons.lock),
            title: Text('End-to-end encryption'),
            subtitle: Text('libsodium (X25519 + secretbox), key-transparency verified'),
          ),
          const ListTile(
            leading: Icon(Icons.public),
            title: Text('goal.arzaroth.com'),
          ),
        ],
      ),
    );
  }
}
