import 'package:flutter/material.dart';

import 'config.dart';
import 'spike/auth_probe.dart';

/// Phase 0 spike harness. A throwaway UI to run the auth probe on a device /
/// emulator and eyeball the result. The e2ee probe runs headless via
/// `dart test` in ../parity; the voice probe needs two real devices (see README).
void main() => runApp(const SpikeApp());

class SpikeApp extends StatelessWidget {
  const SpikeApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Nostragoalus spike',
        theme: ThemeData(colorSchemeSeed: Colors.green, useMaterial3: true),
        home: const SpikeHome(),
      );
}

class SpikeHome extends StatefulWidget {
  const SpikeHome({super.key});
  @override
  State<SpikeHome> createState() => _SpikeHomeState();
}

class _SpikeHomeState extends State<SpikeHome> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String _out = 'Enter creds, run the auth probe.\nAPI: ${AppConfig.apiBase}';
  bool _busy = false;

  Future<void> _runAuth() async {
    setState(() { _busy = true; _out = 'running...'; });
    try {
      final r = await AuthProbe().run(_email.text.trim(), _password.text);
      setState(() => _out = r);
    } catch (e) {
      setState(() => _out = 'error: $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Phase 0 - auth spike')),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TextField(controller: _email, decoration: const InputDecoration(labelText: 'email')),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'password')),
            const SizedBox(height: 12),
            FilledButton(onPressed: _busy ? null : _runAuth, child: const Text('Run auth probe')),
            const SizedBox(height: 16),
            Expanded(child: SingleChildScrollView(child: SelectableText(_out, style: const TextStyle(fontFamily: 'monospace')))),
          ]),
        ),
      );
}
