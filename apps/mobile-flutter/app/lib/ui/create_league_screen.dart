import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';

class CreateLeagueScreen extends ConsumerStatefulWidget {
  const CreateLeagueScreen({super.key});
  @override
  ConsumerState<CreateLeagueScreen> createState() => _CreateLeagueScreenState();
}

class _CreateLeagueScreenState extends ConsumerState<CreateLeagueScreen> {
  final _name = TextEditingController();
  String? _competition;
  String _visibility = 'PRIVATE';
  String _mode = 'NORMAL';
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (_name.text.trim().isEmpty || _competition == null) return;
    setState(() => _busy = true);
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final failed = context.tr('leagues.createFailed');
    try {
      await ref.read(apiProvider).createLeague(CreateLeagueInput(
            competition: _competition!,
            name: _name.text.trim(),
            visibility: _visibility,
            mode: _mode,
          ));
      ref.invalidate(leaguesProvider);
      nav.pop();
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(failed)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comps = ref.watch(competitionsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('leagues.create'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _name,
            decoration: InputDecoration(
              labelText: context.tr('leagues.name'),
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          comps.maybeWhen(
            data: (res) => DropdownButtonFormField<String>(
              initialValue: _competition,
              decoration: InputDecoration(
                labelText: context.tr('nav.competition'),
                border: const OutlineInputBorder(),
              ),
              items: [
                for (final c in res.competitions)
                  DropdownMenuItem(value: c.slug, child: Text(c.name)),
              ],
              onChanged: (v) => setState(() => _competition = v),
            ),
            orElse: () => const LinearProgressIndicator(),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _visibility,
            decoration: InputDecoration(
              labelText: context.tr('leagues.visibility'),
              border: const OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'PRIVATE', child: Text('Private')),
              DropdownMenuItem(value: 'PUBLIC', child: Text('Public')),
            ],
            onChanged: (v) => setState(() => _visibility = v ?? 'PRIVATE'),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _mode,
            decoration: InputDecoration(
              labelText: context.tr('leagues.mode'),
              border: const OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
              DropdownMenuItem(value: 'EASY', child: Text('Easy')),
              DropdownMenuItem(value: 'HARD', child: Text('Hard')),
              DropdownMenuItem(value: 'HARDCORE', child: Text('Hardcore')),
            ],
            onChanged: (v) => setState(() => _mode = v ?? 'NORMAL'),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : _create,
            child: _busy
                ? const SizedBox(
                    height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(context.tr('leagues.create')),
          ),
        ],
      ),
    );
  }
}
