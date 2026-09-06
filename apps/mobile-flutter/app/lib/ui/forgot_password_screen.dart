import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/panel.dart';

/// Request a password-reset email.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).requestPasswordReset(_email.text.trim());
      if (mounted) setState(() => _sent = true);
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
    return Scaffold(
      appBar: AppBar(),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(context.tr('auth.resetTitle'), style: theme.textTheme.headlineLarge),
                        const SizedBox(height: 8),
                        Text(context.tr('auth.resetHint'),
                            style: theme.textTheme.bodyMedium?.copyWith(color: t.muted)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Panel(
                    margin: EdgeInsets.zero,
                    padding: const EdgeInsets.all(16),
                    dividers: false,
                    children: [
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(labelText: context.tr('auth.email')),
                        validator: (v) =>
                            (v == null || !v.contains('@')) ? context.tr('auth.emailInvalid') : null,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _busy || _sent ? null : _submit,
                        child: _busy
                            ? const SizedBox(
                                height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(context.tr('auth.resetSend')),
                      ),
                      if (_sent) ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Icon(Icons.mark_email_read_outlined, size: 18, color: t.emerald),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(context.tr('auth.resetSent'),
                                  style: theme.textTheme.bodySmall?.copyWith(color: t.emerald)),
                            ),
                          ],
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(_error!,
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: TextButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      child: Text(context.tr('auth.goToSignIn')),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
