import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';

/// Two-factor (TOTP) enrolment and removal over the better-auth two-factor
/// endpoints. Enrol: password -> scan secret + save backup codes -> verify code.
/// Remove: password + a current code.
class TwoFactorScreen extends ConsumerStatefulWidget {
  const TwoFactorScreen({super.key});
  @override
  ConsumerState<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

enum _Step { idle, verify, backup }

class _TwoFactorScreenState extends ConsumerState<TwoFactorScreen> {
  final _password = TextEditingController();
  final _code = TextEditingController();
  _Step _step = _Step.idle;
  String _uri = '';
  List<String> _backup = const [];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  String get _secret {
    try {
      return Uri.parse(_uri).queryParameters['secret'] ?? '';
    } catch (_) {
      return '';
    }
  }

  Future<void> _run(Future<void> Function() body) async {
    setState(() { _busy = true; _error = null; });
    try {
      await body();
    } catch (_) {
      if (mounted) setState(() => _error = context.tr('twofa.failed'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startEnable() => _run(() async {
        final res = await ref.read(apiProvider).twoFactorEnable(_password.text);
        _uri = (res['totpURI'] ?? '').toString();
        _backup = ((res['backupCodes'] as List?) ?? const []).map((e) => e.toString()).toList();
        setState(() => _step = _Step.verify);
      });

  Future<void> _confirmEnable() => _run(() async {
        await ref.read(apiProvider).twoFactorVerify(_code.text.trim());
        setState(() => _step = _Step.backup);
        _password.clear();
        _code.clear();
      });

  Future<void> _finish() async {
    ref.invalidate(authControllerProvider);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _disable() => _run(() async {
        final api = ref.read(apiProvider);
        final ok = await api.confirmTotp(_code.text.trim());
        if (!ok) {
          setState(() => _error = context.tr('twofa.wrongCode'));
          return;
        }
        await api.twoFactorDisable(_password.text);
        ref.invalidate(authControllerProvider);
        if (mounted) Navigator.of(context).pop();
      });

  @override
  Widget build(BuildContext context) {
    final enabled = ref.watch(authControllerProvider).valueOrNull?.twoFactorEnabled == true;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('twofa.title'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          if (_step == _Step.backup)
            ..._backupView()
          else if (enabled && _step == _Step.idle)
            ..._disableView()
          else if (_step == _Step.verify)
            ..._verifyView()
          else
            ..._enableView(),
        ],
      ),
    );
  }

  List<Widget> _enableView() => [
        Text(context.tr('twofa.hint')),
        const SizedBox(height: 16),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: InputDecoration(
            labelText: context.tr('auth.password'),
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _startEnable,
          child: Text(context.tr('twofa.enable')),
        ),
      ];

  List<Widget> _verifyView() => [
        Text(context.tr('twofa.scan')),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            title: Text(context.tr('twofa.secret')),
            subtitle: SelectableText(_secret, style: const TextStyle(fontFamily: 'monospace')),
            trailing: IconButton(
              icon: const Icon(Icons.copy),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: _secret));
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text(context.tr('common.copied'))));
              },
            ),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: context.tr('twofa.code'),
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _confirmEnable,
          child: Text(context.tr('twofa.verify')),
        ),
      ];

  List<Widget> _backupView() => [
        Text(context.tr('twofa.backupHintLong')),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: SelectableText(_backup.join('\n'),
                style: const TextStyle(fontFamily: 'monospace')),
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          icon: const Icon(Icons.copy),
          label: Text(context.tr('twofa.copyCodes')),
          onPressed: () {
            Clipboard.setData(ClipboardData(text: _backup.join('\n')));
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(context.tr('common.copied'))));
          },
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: _finish, child: Text(context.tr('twofa.done'))),
      ];

  List<Widget> _disableView() => [
        Row(children: [
          const Icon(Icons.verified_user, color: Colors.green),
          const SizedBox(width: 8),
          Text(context.tr('twofa.enabled')),
        ]),
        const SizedBox(height: 16),
        Text(context.tr('twofa.disableBlurb')),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: InputDecoration(
            labelText: context.tr('auth.password'),
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: context.tr('twofa.code'),
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
          onPressed: _busy ? null : _disable,
          child: Text(context.tr('twofa.disable')),
        ),
      ];
}
