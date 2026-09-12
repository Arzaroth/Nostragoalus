import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show TextInput;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/sso.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'forgot_password_screen.dart';
import 'locale_menu.dart';
import 'signup_screen.dart';
import 'widgets/panel.dart';

/// Email/password sign in over the bearer contract. Sign-up and password reset
/// live on the web app for now; this is the native entry into an existing account.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _emailFocus = FocusNode();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  SsoProviderInfo? _sso;
  String? _ssoChecked;
  int _ssoRequest = 0;
  bool _ssoBusy = false;
  bool _obscure = true;

  @override
  void initState() {
    super.initState();
    // Losing focus is the common way out of the email field - tapping straight
    // into the password. onEditingComplete alone only fires on the keyboard's
    // action key, so anyone who did that never saw the SSO button at all.
    _emailFocus.addListener(() {
      if (!_emailFocus.hasFocus) _checkSso();
    });
  }

  @override
  void dispose() {
    _emailFocus.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    // Tells the platform the pair is complete, which is what makes a password
    // manager offer to SAVE it. Without it credentials are only ever read.
    TextInput.finishAutofillContext();
    await ref
        .read(authControllerProvider.notifier)
        .signIn(_email.text.trim(), _password.text);
  }

  /// When the email's domain is SSO-managed, offer the provider instead of a
  /// password. Runs when the email field loses focus / is submitted.
  Future<void> _checkSso() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      // The address that earned the button is gone, so the button goes too -
      // otherwise it keeps offering a provider for something no longer typed.
      _ssoChecked = null;
      if (_sso != null && mounted) setState(() => _sso = null);
      return;
    }
    // Focus can bounce between the fields; only ask the server about an address
    // it has already answered for.
    if (email == _ssoChecked) return;
    final request = ++_ssoRequest;
    try {
      final info = await ref.read(ssoServiceProvider).check(email);
      // A slower earlier lookup must not overwrite a later answer.
      if (request != _ssoRequest || !mounted) return;
      _ssoChecked = email;
      setState(() => _sso = info);
    } catch (_) {
      // Deliberately not memoised: an SSO-only user has no password to fall
      // back on, so a lookup that failed has to be retried on the next blur.
      if (request != _ssoRequest || !mounted) return;
      setState(() => _sso = null);
    }
  }

  Future<void> _signInWithSso() async {
    final sso = _sso;
    if (sso == null) return;
    setState(() => _ssoBusy = true);
    try {
      // A false return means the callback never produced a token: as much a
      // failure for the user as a thrown error.
      final ok = await ref.read(ssoServiceProvider).signIn(sso.providerId);
      if (!ok && mounted) showToast(context, context.tr('auth.ssoFailed'));
    } catch (_) {
      if (mounted) showToast(context, context.tr('auth.ssoFailed'));
    } finally {
      if (mounted) setState(() => _ssoBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final busy = auth.isLoading;
    final theme = Theme.of(context);
    final t = context.tokens;

    return Scaffold(
      appBar: AppBar(actions: const [LocaleMenu()]),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            // AutofillGroup, or Android treats each field as its own fill unit
            // and a password manager fills only the one that was tapped. The
            // hints alone are not enough - the grouping is what makes an
            // email + password pair fillable in one gesture.
            child: AutofillGroup(
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
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: Image.asset('assets/icon/icon.png', height: 56),
                        ),
                        const SizedBox(height: 20),
                        Text(context.tr('landing.title'), style: theme.textTheme.displaySmall),
                        const SizedBox(height: 10),
                        Text(context.tr('landing.heroA'), style: theme.textTheme.headlineSmall),
                        Text(context.tr('landing.heroB'),
                            style: theme.textTheme.headlineSmall?.copyWith(color: t.muted)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),
                  Panel(
                    margin: EdgeInsets.zero,
                    padding: const EdgeInsets.all(16),
                    dividers: false,
                    children: [
                      TextFormField(
                        controller: _email,
                        focusNode: _emailFocus,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        onEditingComplete: _checkSso,
                        decoration: InputDecoration(labelText: context.tr('auth.email')),
                        validator: (v) => (v == null || !v.contains('@'))
                            ? context.tr('auth.emailInvalid')
                            : null,
                      ),
                      if (_sso != null) ...[
                        const SizedBox(height: 12),
                        FilledButton.tonalIcon(
                          onPressed: _ssoBusy ? null : _signInWithSso,
                          icon: _ssoBusy
                              ? const SizedBox(
                                  height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.business),
                          label: Text(context.tr('auth.ssoDomainUse', {'name': _sso!.name})),
                        ),
                        const SizedBox(height: 8),
                        Text(context.tr('auth.or'),
                            textAlign: TextAlign.center,
                            style: theme.textTheme.labelMedium?.copyWith(color: t.muted)),
                      ],
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: const [AutofillHints.password],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: context.tr('auth.password'),
                          suffixIcon: IconButton(
                            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                            onPressed: () => setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: (v) =>
                            (v == null || v.isEmpty) ? context.tr('auth.passwordRequired') : null,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: busy ? null : _submit,
                        child: busy
                            ? const SizedBox(
                                height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(context.tr('auth.signIn')),
                      ),
                      if (auth.hasError) ...[
                        const SizedBox(height: 12),
                        Text(
                          context.tr(isOfflineError(auth.error)
                              ? 'err.offline'
                              : 'err.signInFailed'),
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.of(context)
                            .push(MaterialPageRoute(builder: (_) => const ForgotPasswordScreen())),
                        child: Text(context.tr('auth.forgot')),
                      ),
                      TextButton(
                        onPressed: () => Navigator.of(context)
                            .push(MaterialPageRoute(builder: (_) => const SignUpScreen())),
                        child: Text(context.tr('auth.signUp')),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            ),
          ),
        ),
      ),
    );
  }
}
