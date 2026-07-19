import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';

/// Owner/moderator league settings: name, visibility, mode, lives, description
/// and the TEAM_SPECIALIST featured team. Sends only the changed fields.
class LeagueSettingsScreen extends ConsumerStatefulWidget {
  const LeagueSettingsScreen({super.key, required this.league});
  final League4 league;
  @override
  ConsumerState<LeagueSettingsScreen> createState() => _LeagueSettingsScreenState();
}

class _LeagueSettingsScreenState extends ConsumerState<LeagueSettingsScreen> {
  late final TextEditingController _name;
  late final TextEditingController _description;
  late String _visibility;
  late String _mode;
  late int _lives;
  String? _featuredTeam; // null => leave unchanged
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.league.name);
    _description = TextEditingController(text: widget.league.description ?? '');
    _visibility = widget.league.visibility;
    _mode = widget.league.mode;
    _lives = (widget.league.lives ?? 3).toInt();
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final l = widget.league;
      final body = <String, dynamic>{};
      final name = _name.text.trim();
      if (name.length >= 3 && name != l.name) body['name'] = name;
      if (_visibility != l.visibility) body['visibility'] = _visibility;
      if (_mode != l.mode) body['mode'] = _mode;
      if (_mode != 'NORMAL' && _lives != (l.lives?.toInt() ?? 3)) body['lives'] = _lives;
      final desc = _description.text.trim();
      if (desc != (l.description ?? '')) body['description'] = desc.isEmpty ? null : desc;
      if (_featuredTeam != null) body['featuredTeamCode'] = _featuredTeam!.isEmpty ? null : _featuredTeam;
      if (body.isNotEmpty) {
        await ref.read(apiProvider).updateLeague(l.id, body);
        ref.invalidate(leagueDetailProvider(l.id));
        ref.invalidate(leaguesProvider);
      }
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(context.tr('err.generic'))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final teams = ref.watch(teamsProvider).valueOrNull?.teams ?? const <Team>[];
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('leagues.settings'))),
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
          DropdownButtonFormField<String>(
            initialValue: _visibility,
            decoration: InputDecoration(
              labelText: context.tr('leagues.visibility'),
              border: const OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'PRIVATE', child: Text('PRIVATE')),
              DropdownMenuItem(value: 'PUBLIC', child: Text('PUBLIC')),
            ],
            onChanged: (v) => setState(() => _visibility = v ?? _visibility),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _mode,
            decoration: InputDecoration(
              labelText: context.tr('leagues.mode'),
              border: const OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'NORMAL', child: Text('NORMAL')),
              DropdownMenuItem(value: 'EASY', child: Text('EASY')),
              DropdownMenuItem(value: 'HARD', child: Text('HARD')),
              DropdownMenuItem(value: 'HARDCORE', child: Text('HARDCORE')),
            ],
            onChanged: (v) => setState(() => _mode = v ?? _mode),
          ),
          if (_mode != 'NORMAL') ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Text(context.tr('leagues.lives')),
                const Spacer(),
                IconButton(
                    onPressed: _lives > 1 ? () => setState(() => _lives--) : null,
                    icon: const Icon(Icons.remove)),
                Text('$_lives'),
                IconButton(
                    onPressed: _lives < 99 ? () => setState(() => _lives++) : null,
                    icon: const Icon(Icons.add)),
              ],
            ),
          ],
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _featuredTeam,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: context.tr('leagues.featuredTeam'),
              border: const OutlineInputBorder(),
            ),
            items: [
              DropdownMenuItem(value: '', child: Text(context.tr('leagues.noFeaturedTeam'))),
              for (final t in teams) DropdownMenuItem(value: t.code, child: Text(t.name)),
            ],
            onChanged: (v) => setState(() => _featuredTeam = v),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _description,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: context.tr('leagues.description'),
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(
                    height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(context.tr('common.save')),
          ),
        ],
      ),
    );
  }
}
