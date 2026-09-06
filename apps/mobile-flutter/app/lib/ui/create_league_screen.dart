import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'league_settings_screen.dart'
    show LivesStepper, modeLabelKey, pickable, visibilityLabelKey;
import 'widgets/panel.dart';

class CreateLeagueScreen extends ConsumerStatefulWidget {
  const CreateLeagueScreen({super.key});
  @override
  ConsumerState<CreateLeagueScreen> createState() => _CreateLeagueScreenState();
}

class _CreateLeagueScreenState extends ConsumerState<CreateLeagueScreen> {
  final _name = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  String? _competition;
  VisibilityValue _visibility = VisibilityValue.private;
  ModeValue _mode = ModeValue.normal;
  int _lives = 3;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    final nav = Navigator.of(context);
    try {
      await ref.read(apiProvider).createLeague(CreateLeagueInput(
            competition: _competition!,
            name: _name.text.trim(),
            visibility: _visibility,
            mode: _mode,
            lives: _mode == ModeValue.hardcore ? _lives : null,
          ));
      ref.invalidate(leaguesProvider);
      nav.pop();
    } catch (e) {
      if (mounted) showToast(context, apiMessage(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comps = ref.watch(competitionsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('leagues.create'))),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            Panel(
              margin: EdgeInsets.zero,
              padding: const EdgeInsets.all(16),
              dividers: false,
              children: [
                TextFormField(
                  controller: _name,
                  decoration: InputDecoration(labelText: context.tr('leagues.name')),
                  validator: (v) => (v == null || v.trim().length < 3)
                      ? context.tr('leagues.nameTooShort')
                      : null,
                ),
                const SizedBox(height: 12),
                comps.maybeWhen(
                  data: (res) => DropdownButtonFormField<String>(
                    initialValue: _competition,
                    decoration: InputDecoration(labelText: context.tr('nav.competition')),
                    items: [
                      for (final c in res.competitions)
                        DropdownMenuItem(value: c.slug, child: Text(c.name)),
                    ],
                    validator: (v) => v == null ? context.tr('leagues.competitionRequired') : null,
                    onChanged: (v) => setState(() => _competition = v),
                  ),
                  orElse: () => const LinearProgressIndicator(),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<VisibilityValue>(
                  initialValue: _visibility,
                  decoration: InputDecoration(labelText: context.tr('leagues.visibility')),
                  items: [
                    for (final v in pickable(VisibilityValue.values, VisibilityValue.unknown))
                      DropdownMenuItem(value: v, child: Text(context.tr(visibilityLabelKey(v)))),
                  ],
                  onChanged: (v) => setState(() => _visibility = v ?? VisibilityValue.private),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<ModeValue>(
                  initialValue: _mode,
                  decoration: InputDecoration(labelText: context.tr('leagues.mode')),
                  items: [
                    for (final m in pickable(ModeValue.values, ModeValue.unknown))
                      DropdownMenuItem(value: m, child: Text(context.tr(modeLabelKey(m)))),
                  ],
                  onChanged: (v) => setState(() => _mode = v ?? ModeValue.normal),
                ),
                // HARDCORE is the only mode the server accepts a lives count for,
                // and it rejects the create without one.
                if (_mode == ModeValue.hardcore) ...[
                  const SizedBox(height: 8),
                  LivesStepper(
                    lives: _lives,
                    onChanged: (v) => setState(() => _lives = v),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _create,
                  child: _busy
                      ? const SizedBox(
                          height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(context.tr('leagues.create')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
