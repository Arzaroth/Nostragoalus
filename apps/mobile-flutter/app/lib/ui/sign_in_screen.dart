import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/sso.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'locale_menu.dart';

/// Email/password sign in over the bearer contract. Sign-up and password reset
/// live on the web app for now; this is the native entry into an existing account.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  SsoProviderInfo? _sso;
  bool _ssoBusy = false;
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    await ref
        .read(authControllerProvider.notifier)
        .signIn(_email.text.trim(), _password.text);
  }

  /// When the email's domain is SSO-managed, offer the provider instead of a
  /// password. Runs when the email field loses focus / is submitted.
  Future<void> _checkSso() async {
    final email = _email.text.trim();
    if (!email.contains('@')) return;
    final info = await ref.read(ssoServiceProvider).check(email);
    if (mounted) setState(() => _sso = info);
  }

  Future<void> _signInWithSso() async {
    final sso = _sso;
    if (sso == null) return;
    setState(() => _ssoBusy = true);
    try {
      await ref.read(ssoServiceProvider).signIn(sso.providerId);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(context.tr('auth.ssoFailed'))));
      }
    } finally {
      if (mounted) setState(() => _ssoBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final busy = auth.isLoading;

    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('landing.title')),
        actions: const [LocaleMenu()],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Image.asset('assets/icon/icon.png', height: 88),
                  const SizedBox(height: 16),
                  Text(context.tr('landing.title'),
                      style: Theme.of(context).textTheme.headlineMedium,
                      textAlign: TextAlign.center),
                  const SizedBox(height: 4),
                  Text(context.tr('auth.signIn'),
                      style: Theme.of(context).textTheme.titleMedium,
                      textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  TextFormField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    onEditingComplete: _checkSso,
                    decoration: InputDecoration(
                      labelText: context.tr('auth.email'),
                      border: const OutlineInputBorder(),
                    ),
                    validator: (v) =>
                        (v == null || !v.contains('@')) ? context.tr('auth.email') : null,
                  ),
                  if (_sso != null) ...[
                    const SizedBox(height: 16),
                    FilledButton.tonalIcon(
                      onPressed: _ssoBusy ? null : _signInWithSso,
                      icon: _ssoBusy
                          ? const SizedBox(
                              height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.business),
                      label: Text(context.tr('auth.ssoDomainUse', {'name': _sso!.name})),
                    ),
                    const SizedBox(height: 8),
                    Text(context.tr('auth.or'), textAlign: TextAlign.center),
                  ],
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _password,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.password],
                    onFieldSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      labelText: context.tr('auth.password'),
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                    validator: (v) =>
                        (v == null || v.isEmpty) ? context.tr('auth.password') : null,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: busy ? null : _submit,
                    child: busy
                        ? const SizedBox(
                            height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(context.tr('auth.signIn')),
                  ),
                  if (auth.hasError) ...[
                    const SizedBox(height: 16),
                    Text(
                      context.tr('err.signInFailed'),
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
