import 'package:flutter/material.dart';

import '../../config.dart';
import '../../theme/app_theme.dart';

/// The one avatar in the app: the picture when there is one, else the name's
/// condensed initial on the primary container. Relative image URLs (what the
/// media routes return) resolve against the API base.
///
/// The image error handler is not optional: without it a 404ing avatar URL
/// throws out of every rebuild.
class UserAvatar extends StatelessWidget {
  const UserAvatar({
    super.key,
    required this.name,
    this.image,
    this.radius = 18,
    this.imageProvider,
  });

  final String name;
  final String? image;
  final double radius;

  /// An already-resolved image (a freshly picked local file), used instead of
  /// [image] when given.
  final ImageProvider? imageProvider;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final url = image;
    final provider = imageProvider ??
        (url == null || url.isEmpty
            ? null
            : NetworkImage(url.startsWith('http') ? url : '${AppConfig.apiBase}$url'));
    return CircleAvatar(
      radius: radius,
      backgroundColor: scheme.primaryContainer,
      foregroundImage: provider,
      onForegroundImageError: provider == null ? null : (_, __) {},
      child: Text(
        name.isEmpty ? '?' : name.characters.first.toUpperCase(),
        style: context.tokens
            .score(radius * 0.9, weight: FontWeight.w600, color: scheme.onPrimaryContainer),
      ),
    );
  }
}
