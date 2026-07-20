import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../api/models.gen.dart';
import '../data/country_centroids.dart';
import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import 'widgets/async_value_view.dart';

/// The nations board: an OpenStreetMap world map with a marker at each team's
/// country centroid (green in / grey out), plus the full still-in / eliminated
/// list below - the same information the web's Leaflet map carries.
class MapScreen extends ConsumerWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final teams = ref.watch(teamsProvider);
    final eliminated = ref.watch(eliminatedProvider).valueOrNull?.toSet() ?? const <String>{};
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
              children: [
                SizedBox(
                  height: 280,
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
                          for (final t in res.teams)
                            if (countryCentroids[t.code] != null)
                              Marker(
                                point: LatLng(
                                    countryCentroids[t.code]![0], countryCentroids[t.code]![1]),
                                width: 14,
                                height: 14,
                                child: Container(
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: eliminated.contains(t.code)
                                        ? Colors.grey
                                        : Colors.green,
                                    border: Border.all(color: Colors.white, width: 1.5),
                                  ),
                                ),
                              ),
                        ],
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    context.tr('map.stillIn').replaceAll('{n}', '$stillIn'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                for (final t in sorted)
                  Builder(builder: (context) {
                    final out = eliminated.contains(t.code);
                    return ListTile(
                      leading: Icon(out ? Icons.cancel : Icons.check_circle,
                          color: out ? Theme.of(context).disabledColor : Colors.green),
                      title: Text(
                        t.name,
                        style: out
                            ? TextStyle(
                                decoration: TextDecoration.lineThrough,
                                color: Theme.of(context).disabledColor)
                            : null,
                      ),
                      subtitle: out ? Text(context.tr('map.eliminated')) : null,
                      trailing: Text(t.code),
                    );
                  }),
              ],
            );
          },
        ),
      ),
    );
  }
}
