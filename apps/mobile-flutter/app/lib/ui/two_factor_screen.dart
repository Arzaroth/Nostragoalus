import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/panel.dart';

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
    final failed = context.tr('twofa.failed');
    try {
      await body();
    } catch (_) {
      if (mounted) setState(() => _error = failed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startEnable() => _run(() async {
        final res = await ref.read(apiProvider).twoFactorEnable(_password.text);
        final uri = res['totpURI'];
        // No secret means no enrolment: advancing would show an empty, copyable key.
        if (uri is! String || uri.isEmpty) throw StateError('no totpURI');
        _uri = uri;
        _backup =
            ((res['backupCodes'] as List?) ?? const []).map((e) => e.toString()).toList();
        if (mounted) setState(() => _step = _Step.verify);
      });

  Future<void> _confirmEnable() => _run(() async {
        await ref.read(apiProvider).twoFactorVerify(_code.text.trim());
        if (!mounted) return;
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
        final wrongCode = context.tr('twofa.wrongCode');
        final ok = await api.confirmTotp(_code.text.trim());
        if (!ok) {
          if (mounted) setState(() => _error = wrongCode);
          return;
        }
        await api.twoFactorDisable(_password.text);
        ref.invalidate(authControllerProvider);
        if (mounted) Navigator.of(context).pop();
      });

  void _copy(String text) {
    Clipboard.setData(ClipboardData(text: text));
    showToast(context, context.tr('common.copied'));
  }

  @override
  Widget build(BuildContext context) {
    final enabled = ref.watch(authControllerProvider).valueOrNull?.twoFactorEnabled == true;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('twofa.title'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
              child: Text(_error!,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)),
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

  Widget _blurb(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
        child: Text(text,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.tokens.muted)),
      );

  List<Widget> _enableView() => [
        _blurb(context.tr('twofa.hint')),
        Panel(
          margin: EdgeInsets.zero,
          padding: const EdgeInsets.all(16),
          dividers: false,
          children: [
            TextField(
              controller: _password,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(labelText: context.tr('auth.password')),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _startEnable,
              child: Text(context.tr('twofa.enable')),
            ),
          ],
        ),
      ];

  List<Widget> _verifyView() => [
        _blurb(context.tr('twofa.scan')),
        Panel(
          margin: EdgeInsets.zero,
          children: [
            PanelRow(
              leading: const Icon(Icons.key_outlined),
              title: Text(context.tr('twofa.secret')),
              subtitle: SelectableText(_secret, style: const TextStyle(fontFamily: 'monospace')),
              trailing: IconButton(
                icon: const Icon(Icons.copy_outlined),
                tooltip: context.tr('twofa.copy'),
                onPressed: () => _copy(_secret),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    decoration: InputDecoration(labelText: context.tr('twofa.code')),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _busy ? null : _confirmEnable,
                    child: Text(context.tr('twofa.verify')),
                  ),
                ],
              ),
            ),
          ],
        ),
      ];

  List<Widget> _backupView() => [
        _blurb(context.tr('twofa.backupHintLong')),
        Panel(
          margin: EdgeInsets.zero,
          padding: const EdgeInsets.all(16),
          dividers: false,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: context.tokens.raised,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: SelectableText(_backup.join('\n'),
                    style: const TextStyle(fontFamily: 'monospace')),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              icon: const Icon(Icons.copy_outlined),
              label: Text(context.tr('twofa.copyCodes')),
              onPressed: () => _copy(_backup.join('\n')),
            ),
            const SizedBox(height: 12),
            FilledButton(onPressed: _finish, child: Text(context.tr('twofa.done'))),
          ],
        ),
      ];

  List<Widget> _disableView() {
    final scheme = Theme.of(context).colorScheme;
    final t = context.tokens;
    return [
      Panel(
        margin: EdgeInsets.zero,
        children: [
          PanelRow(
            leading: Icon(Icons.verified_user, color: t.emerald),
            title: Text(context.tr('twofa.enabled')),
            subtitle: Text(context.tr('twofa.disableBlurb')),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _password,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: InputDecoration(labelText: context.tr('auth.password')),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  decoration: InputDecoration(labelText: context.tr('twofa.code')),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  style: FilledButton.styleFrom(
                      backgroundColor: scheme.error, foregroundColor: scheme.onError),
                  onPressed: _busy ? null : _disable,
                  child: Text(context.tr('twofa.disable')),
                ),
              ],
            ),
          ),
        ],
      ),
    ];
  }
}
