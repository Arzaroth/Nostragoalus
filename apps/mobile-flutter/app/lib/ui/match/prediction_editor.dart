import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../feedback.dart';
import '../widgets/panel.dart';

/// Score / outcome-only / joker editor for one match, saved into the league the
/// user picked for this competition. No cross-competition fallback: a league
/// from another competition would silently score the pick somewhere else.
class PredictionEditor extends ConsumerStatefulWidget {
  const PredictionEditor({
    super.key,
    required this.matchId,
    required this.competitionId,
    required this.homeTeam,
    required this.awayTeam,
    required this.current,
    required this.isLocked,
  });

  final String matchId;
  final String competitionId;
  final String homeTeam;
  final String awayTeam;
  final MyPrediction? current;
  final bool isLocked;

  @override
  ConsumerState<PredictionEditor> createState() => _PredictionEditorState();
}

class _PredictionEditorState extends ConsumerState<PredictionEditor> {
  late int _home = widget.current?.homeGoals ?? 0;
  late int _away = widget.current?.awayGoals ?? 0;
  late bool _outcomeOnly = widget.current?.isOutcomeOnly ?? false;
  String? _leagueId;
  bool? _jokerPending;
  bool _saving = false;

  @override
  void didUpdateWidget(PredictionEditor old) {
    super.didUpdateWidget(old);
    final now = widget.current;
    if (now?.updatedAt == old.current?.updatedAt && now?.id == old.current?.id) return;
    // A pick edited elsewhere (another device, a refetch) wins over stale local state.
    setState(() {
      _home = now?.homeGoals ?? 0;
      _away = now?.awayGoals ?? 0;
      _outcomeOnly = now?.isOutcomeOnly ?? false;
      _jokerPending = null;
    });
  }

  bool get _isJoker => _jokerPending ?? widget.current?.isJoker ?? false;

  Future<void> _save(String leagueId, ModeValue mode) async {
    setState(() => _saving = true);
    await runAction(
      context,
      () => ref.read(savePredictionProvider)(
        leagueId,
        mode,
        widget.matchId,
        PredictionInput(home: _home, away: _away, isOutcomeOnly: _outcomeOnly),
      ),
      successKey: 'picks.saved',
    );
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _toggleJoker(String leagueId, ModeValue mode) async {
    if (_saving) return;
    final next = !_isJoker;
    setState(() {
      _saving = true;
      _jokerPending = next;
    });
    final ok = await runAction(context, () async {
      await ref.read(setJokerProvider)(leagueId, mode, widget.matchId, next);
      ref.invalidate(leaguesProvider);
    });
    if (!mounted) return;
    setState(() {
      _saving = false;
      if (!ok) _jokerPending = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    if (widget.isLocked) {
      final c = widget.current;
      return Panel(
        margin: EdgeInsets.zero,
        children: [
          PanelRow(
            leading: const Icon(Icons.lock),
            title: Text(context.tr('picks.locked')),
            subtitle: c == null ? null : Text(context.tr('picks.yourPrediction')),
            trailing: c == null
                ? null
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (c.isJoker) ...[
                        Icon(Icons.star, size: 16, color: t.amber),
                        const SizedBox(width: 6),
                      ],
                      Text(c.isOutcomeOnly ? _outcome(context, c) : '${c.homeGoals} - ${c.awayGoals}',
                          style: t.score(22)),
                    ],
                  ),
          ),
        ],
      );
    }

    return ref.watch(leaguesProvider).when(
          loading: () => const Center(
            child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()),
          ),
          error: (e, _) => Panel(
            margin: EdgeInsets.zero,
            padding: const EdgeInsets.all(16),
            children: [Text(apiMessage(context, e))],
          ),
          data: (res) {
            final candidates = res.leagues
                .where((l) => l.competition.id == widget.competitionId)
                .toList();
            if (candidates.isEmpty) {
              return Panel(
                margin: EdgeInsets.zero,
                padding: const EdgeInsets.all(16),
                children: [Text(context.tr('picks.noLeagueForCompetition'))],
              );
            }
            final league = candidates.firstWhere((l) => l.id == _leagueId,
                orElse: () => candidates.first);
            return _editor(context, candidates, league);
          },
        );
  }

  String _outcome(BuildContext context, MyPrediction c) => c.homeGoals > c.awayGoals
      ? '1'
      : c.homeGoals < c.awayGoals
          ? '2'
          : 'X';

  Widget _editor(
    BuildContext context,
    List<LeaguesResponseLeague> candidates,
    LeaguesResponseLeague league,
  ) {
    final t = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PanelHeading(
          title: context.tr('picks.yourPrediction'),
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
        ),
        Panel(
          margin: EdgeInsets.zero,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _Stepper(
                      label: widget.homeTeam,
                      value: _home,
                      muted: _outcomeOnly,
                      onChanged: (v) => setState(() => _home = v),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 22),
                    child: Text('-', style: t.score(32, color: t.faint)),
                  ),
                  Expanded(
                    child: _Stepper(
                      label: widget.awayTeam,
                      value: _away,
                      muted: _outcomeOnly,
                      onChanged: (v) => setState(() => _away = v),
                    ),
                  ),
                ],
              ),
            ),
            if (candidates.length > 1)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: DropdownButtonFormField<String>(
                  initialValue: league.id,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: context.tr('picks.leagueForPick')),
                  items: [
                    for (final l in candidates)
                      DropdownMenuItem(value: l.id, child: Text(l.name)),
                  ],
                  onChanged: (id) => setState(() => _leagueId = id),
                ),
              ),
            PanelRow(
              leading: const Icon(Icons.rule),
              title: Text(context.tr('picks.outcomeOnly')),
              trailing: Switch(
                value: _outcomeOnly,
                onChanged: (v) => setState(() => _outcomeOnly = v),
              ),
              onTap: () => setState(() => _outcomeOnly = !_outcomeOnly),
            ),
            PanelRow(
              leading: Icon(_isJoker ? Icons.star : Icons.star_outline,
                  color: _isJoker ? t.amber : null),
              title: Text(context.tr('picks.joker')),
              trailing: Switch(
                value: _isJoker,
                activeThumbColor: t.amber,
                onChanged: _saving ? null : (_) => _toggleJoker(league.id, league.mode),
              ),
              onTap: _saving ? null : () => _toggleJoker(league.id, league.mode),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton(
                onPressed: _saving ? null : () => _save(league.id, league.mode),
                child: _saving
                    ? const SizedBox(
                        height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(context.tr('picks.save')),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// One side of the scoreboard: the team name over a large numeral with a
/// minus / plus on either side.
class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.value,
    required this.onChanged,
    this.muted = false,
  });
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  /// Outcome-only picks keep the numbers but read them as a result, so they dim.
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    return Column(
      children: [
        Text(label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelMedium?.copyWith(color: t.muted)),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _StepButton(
              icon: Icons.remove,
              onPressed: value > 0 ? () => onChanged(value - 1) : null,
            ),
            SizedBox(
              width: 56,
              child: Text('$value',
                  textAlign: TextAlign.center,
                  style: t.score(48, color: muted ? t.muted : theme.colorScheme.onSurface)),
            ),
            _StepButton(
              icon: Icons.add,
              onPressed: value < 20 ? () => onChanged(value + 1) : null,
            ),
          ],
        ),
      ],
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.onPressed});
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return IconButton.filledTonal(
      onPressed: onPressed,
      icon: Icon(icon, size: 20),
      style: IconButton.styleFrom(
        backgroundColor: t.raised,
        foregroundColor: Theme.of(context).colorScheme.onSurface,
        disabledBackgroundColor: t.raised.withValues(alpha: 0.5),
        disabledForegroundColor: t.faint,
        minimumSize: const Size(40, 40),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}
