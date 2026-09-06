import 'package:flutter/material.dart';

import '../../api/models.gen.dart';
import '../../i18n/i18n_scope.dart';
import '../../theme/app_theme.dart';
import 'panel.dart';
import 'team_flag.dart';

/// A group table on a board: the column heads, then one row per team with its
/// flag, name and the played / goal-difference / points numerals. Shared by the
/// standings screen and the match insights tab.
///
/// No row is marked as qualifying: the server sends no qualification data and
/// the cut is competition-specific (best third places advance), so the table
/// must not imply one.
class GroupStandingsTable extends StatelessWidget {
  const GroupStandingsTable({
    super.key,
    required this.title,
    required this.rows,
    this.headingPadding = const EdgeInsets.fromLTRB(20, 20, 20, 8),
  });

  final String title;
  final List<GroupRow> rows;
  final EdgeInsetsGeometry headingPadding;

  static const _numWidth = 40.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.tokens;
    final head = theme.textTheme.labelSmall?.copyWith(color: t.faint);
    Widget num(String s, {TextStyle? style}) => SizedBox(
          width: _numWidth,
          child: Text(s, textAlign: TextAlign.center, style: style),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PanelHeading(title: title, padding: headingPadding),
        Panel(
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 8, 8),
              child: Row(
                children: [
                  Expanded(child: Text(context.tr('standings.team'), style: head)),
                  num(context.tr('standings.p'), style: head),
                  num(context.tr('standings.gd'), style: head),
                  num(context.tr('standings.pts'), style: head),
                ],
              ),
            ),
            for (final r in rows)
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(16, 10, 8, 10),
                child: Row(
                  children: [
                    TeamFlag(r.code, height: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(r.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                    ),
                    num('${r.played.toInt()}', style: t.score(17, weight: FontWeight.w500, color: t.muted)),
                    num(_signed(r.gd.toInt()), style: t.score(17, weight: FontWeight.w500, color: t.muted)),
                    num('${r.points.toInt()}', style: t.score(20)),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }

  static String _signed(int v) => v > 0 ? '+$v' : '$v';
}
