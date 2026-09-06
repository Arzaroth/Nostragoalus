import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/panel.dart';

/// Create an account. Email verification may be required before sign-in.
class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});
  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _busy = false;
  bool _obscure = true;
  String? _message;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    final email = _email.text.trim();
    try {
      await ref.read(authRepositoryProvider).signUp(_name.text.trim(), email, _password.text);
      if (mounted) setState(() => _message = context.tr('auth.verifySent', {'email': email}));
    } catch (e) {
      if (mounted) setState(() => _message = apiMessage(context, e));
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
                        Text(context.tr('auth.signUp'), style: theme.textTheme.headlineLarge),
                        const SizedBox(height: 6),
                        Text(context.tr('landing.heroB'),
                            style: theme.textTheme.headlineSmall?.copyWith(color: t.muted)),
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
                        controller: _name,
                        autofillHints: const [AutofillHints.name],
                        decoration: InputDecoration(labelText: context.tr('auth.displayName')),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? context.tr('auth.nameRequired')
                            : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        decoration: InputDecoration(labelText: context.tr('auth.email')),
                        validator: (v) =>
                            (v == null || !v.contains('@')) ? context.tr('auth.emailInvalid') : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: const [AutofillHints.newPassword],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: context.tr('auth.password'),
                          suffixIcon: IconButton(
                            icon: Icon(
                                _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                            onPressed: () => setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: (v) =>
                            (v == null || v.length < 8) ? context.tr('auth.passwordTooShort') : null,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? const SizedBox(
                                height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(context.tr('auth.signUp')),
                      ),
                      if (_message != null) ...[
                        const SizedBox(height: 12),
                        Text(_message!,
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodySmall?.copyWith(color: t.muted)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: TextButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      child: Text(context.tr('auth.haveAccount')),
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
