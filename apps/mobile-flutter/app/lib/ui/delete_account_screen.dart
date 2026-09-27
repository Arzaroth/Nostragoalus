import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/auth_repository.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/panel.dart';

final deletionPolicyProvider = FutureProvider.autoDispose<DeletionPolicy>(
    (ref) => ref.watch(authRepositoryProvider).deletionPolicy());

/// Permanently delete the account, confirmed the way the web confirms it: a
/// mailed link when the server can send mail, otherwise the password (or, for
/// an SSO account, the session itself), plus a current code when 2FA is on.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});
  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _password = TextEditingController();
  final _code = TextEditingController();
  bool _busy = false;
  bool _mailSent = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _password.addListener(_refresh);
    _code.addListener(_refresh);
  }

  void _refresh() => setState(() {});

  @override
  void dispose() {
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  bool _ready(DeletionPolicy policy, bool needsCode) =>
      policy.mailConfirmed ||
      ((!policy.needsPassword || _password.text.isNotEmpty) &&
          (!needsCode || _code.text.length == 6));

  Future<void> _submit(DeletionPolicy policy, bool needsCode) async {
    if (!policy.mailConfirmed) {
      final ok = await confirmDialog(
        context,
        title: context.tr('account.dangerTitle'),
        message: context.tr('account.dangerHint'),
        confirmLabel: context.tr('account.deleteAccount'),
      );
      if (!ok || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final deleted = await ref.read(authControllerProvider.notifier).deleteAccount(
            policy,
            password: policy.needsPassword ? _password.text : null,
            totpCode: needsCode ? _code.text : null,
          );
      if (!mounted) return;
      if (deleted) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      } else {
        setState(() => _mailSent = true);
      }
    } catch (e) {
      if (mounted) setState(() => _error = apiMessage(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final policy = ref.watch(deletionPolicyProvider);
    final user = ref.watch(authControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('account.deleteAccount'))),
      body: policy.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(apiMessage(context, e), textAlign: TextAlign.center),
          ),
        ),
        data: (policy) {
          final needsCode = !policy.mailConfirmed && user?.twoFactorEnabled == true;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Panel(
                tint: t.live.withValues(alpha: 0.08),
                children: [
                  PanelRow(
                    leading: Icon(Icons.warning_amber_outlined, color: t.live),
                    title: Text(context.tr('account.dangerTitle')),
                    subtitle: Text(context.tr('account.dangerHint')),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_mailSent)
                Text(context.tr('account.deleteMailSent'),
                    key: const ValueKey('delete-mail-sent'), style: theme.textTheme.bodyMedium)
              else ...[
                if (policy.mailConfirmed)
                  Text(context.tr('account.deleteMailHint'),
                      style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                if (policy.needsPassword) ...[
                  Text(context.tr('account.confirmDeleteHint'),
                      style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                  const SizedBox(height: 8),
                  TextField(
                    key: const ValueKey('delete-password'),
                    controller: _password,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(labelText: context.tr('account.currentPassword')),
                  ),
                ],
                if (needsCode) ...[
                  const SizedBox(height: 12),
                  TextField(
                    key: const ValueKey('delete-code'),
                    controller: _code,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(labelText: context.tr('twofa.disableCode')),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: theme.textTheme.bodySmall?.copyWith(color: t.live)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  key: const ValueKey('delete-submit'),
                  style: FilledButton.styleFrom(backgroundColor: t.live),
                  onPressed: _busy || !_ready(policy, needsCode) ? null : () => _submit(policy, needsCode),
                  child: Text(policy.mailConfirmed
                      ? context.tr('account.deleteSendMail')
                      : context.tr('account.deleteAccount')),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
