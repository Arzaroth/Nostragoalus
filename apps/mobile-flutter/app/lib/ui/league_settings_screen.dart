import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.gen.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'feedback.dart';
import 'league_rewards_editor_screen.dart';

/// The edited form values, so the changed-fields diff can be computed (and
/// tested) without a widget tree.
class LeagueEdit {
  const LeagueEdit({
    required this.name,
    required this.visibility,
    required this.mode,
    required this.lives,
    required this.description,
    this.featuredTeamCode,
  });

  final String name;
  final String visibility;
  final String mode;
  final int lives;
  final String description;

  /// null leaves the featured team untouched; `''` clears it.
  final String? featuredTeamCode;
}

/// The PATCH body for a league edit: only what changed, and `lives` exactly
/// when the server's `normalizeLives` wants it (HARDCORE, always sent alongside
/// a mode switch; every other mode forces lives to null server-side).
Map<String, dynamic> leagueUpdateBody(LeagueDetailResponseLeague current, LeagueEdit edited) {
  final body = <String, dynamic>{};
  final name = edited.name.trim();
  if (name != current.name) body['name'] = name;
  if (edited.visibility != current.visibility) body['visibility'] = edited.visibility;
  if (edited.mode != current.mode) body['mode'] = edited.mode;
  if (edited.mode == 'HARDCORE' &&
      (body.containsKey('mode') || edited.lives != current.lives?.toInt())) {
    body['lives'] = edited.lives;
  }
  final description = edited.description.trim();
  if (description != (current.description ?? '')) {
    body['description'] = description.isEmpty ? null : description;
  }
  final featured = edited.featuredTeamCode;
  if (featured != null) body['featuredTeamCode'] = featured.isEmpty ? null : featured;
  return body;
}

/// Owner/moderator league settings: name, visibility, mode, lives, description
/// and the TEAM_SPECIALIST featured team. Sends only the changed fields.
class LeagueSettingsScreen extends ConsumerStatefulWidget {
  const LeagueSettingsScreen({super.key, required this.league});
  final LeagueDetailResponseLeague league;
  @override
  ConsumerState<LeagueSettingsScreen> createState() => _LeagueSettingsScreenState();
}

class _LeagueSettingsScreenState extends ConsumerState<LeagueSettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _description;
  late String _visibility;
  late String _mode;
  late int _lives;
  String? _featuredTeam;
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
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final league = widget.league;
      final body = leagueUpdateBody(
        league,
        LeagueEdit(
          name: _name.text,
          visibility: _visibility,
          mode: _mode,
          lives: _lives,
          description: _description.text,
          featuredTeamCode: _featuredTeam,
        ),
      );
      if (body.isNotEmpty) {
        await ref.read(apiProvider).updateLeague(league.id, body);
        ref.invalidate(leagueDetailProvider(league.id));
        ref.invalidate(leaguesProvider);
      }
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showToast(context, apiMessage(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final teams = ref.watch(teamsProvider).valueOrNull?.teams ?? const <Team>[];
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('leagues.settings'))),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _name,
              decoration: InputDecoration(
                labelText: context.tr('leagues.name'),
                border: const OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().length < 3) ? context.tr('leagues.nameTooShort') : null,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _visibility,
              decoration: InputDecoration(
                labelText: context.tr('leagues.visibility'),
                border: const OutlineInputBorder(),
              ),
              items: [
                for (final v in LeagueDetailResponseLeague.visibilityValues)
                  DropdownMenuItem(value: v, child: Text(context.tr(visibilityLabelKey(v)))),
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
              items: [
                for (final m in LeagueDetailResponseLeague.modeValues)
                  DropdownMenuItem(value: m, child: Text(context.tr(modeLabelKey(m)))),
              ],
              onChanged: (v) => setState(() => _mode = v ?? _mode),
            ),
            if (_mode == 'HARDCORE') ...[
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
                // The league response carries no featuredTeamCode yet, so the
                // control cannot show the current pick; say so instead of
                // rendering a blank that reads as "none".
                DropdownMenuItem(value: null, child: Text(context.tr('leagues.featuredTeamKeep'))),
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
            const SizedBox(height: 8),
            OutlinedButton.icon(
              icon: const Icon(Icons.card_giftcard),
              label: Text(context.tr('leagues.editPrizes')),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => LeagueRewardsEditorScreen(leagueId: widget.league.id),
              )),
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
      ),
    );
  }
}

/// Shared by the settings and create screens, which used to disagree on the
/// same enum values.
String modeLabelKey(String mode) => switch (mode) {
      'EASY' => 'leagues.modeEasy',
      'HARD' => 'leagues.modeHard',
      'HARDCORE' => 'leagues.modeHardcore',
      _ => 'leagues.modeNormal',
    };

String visibilityLabelKey(String visibility) =>
    visibility == 'PUBLIC' ? 'leagues.visibilityPublicShort' : 'leagues.visibilityPrivateShort';

String roleLabelKey(String role) => switch (role) {
      'OWNER' => 'leagues.roleOwner',
      'MODERATOR' => 'leagues.roleModerator',
      _ => 'leagues.roleMember',
    };
