import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../api/models.gen.dart';
import '../data/country_centroids.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'widgets/async_value_view.dart';
import 'widgets/panel.dart';
import 'widgets/team_flag.dart';

/// The nations board: an OpenStreetMap world map with a marker at each team's
/// country centroid (emerald in / faint out), plus the full still-in /
/// eliminated list below - the same information the web's Leaflet map carries.
class MapScreen extends ConsumerWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final teams = ref.watch(teamsProvider);
    final eliminated = ref.watch(eliminatedProvider).valueOrNull?.toSet() ?? const <String>{};
    final theme = Theme.of(context);
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('nav.map'))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(eliminatedProvider);
          ref.invalidate(teamsProvider);
          await ref.read(eliminatedProvider.future);
          await ref.read(teamsProvider.future);
        },
        child: AsyncValueView<TeamsResponse>(
          value: teams,
          onRetry: () => ref.invalidate(teamsProvider),
          data: (res) {
            final sorted = [...res.teams]..sort((a, b) {
                final ae = eliminated.contains(a.code), be = eliminated.contains(b.code);
                if (ae != be) return ae ? 1 : -1; // still-in first
                return a.name.compareTo(b.name);
              });
            final stillIn = sorted.where((t) => !eliminated.contains(t.code)).length;
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      height: 280,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: t.rule),
                      ),
                      child: FlutterMap(
                        options: const MapOptions(
                          initialCenter: LatLng(25, 10),
                          initialZoom: 1.4,
                          interactionOptions: InteractionOptions(flags: InteractiveFlag.all),
                        ),
                        children: [
                          TileLayer(
                            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                            userAgentPackageName: 'com.nostragoalus.app',
                          ),
                          MarkerLayer(
                            markers: [
                              for (final team in res.teams)
                                if (countryCentroids[team.code] != null)
                                  Marker(
                                    point: LatLng(countryCentroids[team.code]![0],
                                        countryCentroids[team.code]![1]),
                                    width: 14,
                                    height: 14,
                                    child: Container(
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: eliminated.contains(team.code) ? t.faint : t.emerald,
                                        border: Border.all(color: theme.colorScheme.primary, width: 1.5),
                                      ),
                                    ),
                                  ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                PanelHeading(title: context.tr('map.stillIn').replaceAll('{n}', '$stillIn')),
                Panel(children: [
                  for (final team in sorted)
                    Builder(builder: (context) {
                      final out = eliminated.contains(team.code);
                      return PanelRow(
                        leading: Opacity(opacity: out ? 0.45 : 1, child: TeamFlag(team.code, height: 20)),
                        title: Text(
                          team.name,
                          style: out
                              ? TextStyle(decoration: TextDecoration.lineThrough, color: t.faint)
                              : null,
                        ),
                        subtitle: out ? Text(context.tr('map.eliminated')) : null,
                        trailing: Icon(out ? Icons.cancel_outlined : Icons.check_circle,
                            color: out ? t.faint : t.emerald),
                      );
                    }),
                ]),
              ],
            );
          },
        ),
      ),
    );
  }
}
