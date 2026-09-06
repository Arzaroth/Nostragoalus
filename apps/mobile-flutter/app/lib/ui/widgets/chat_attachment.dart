import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/app_theme.dart';

/// Renders one E2EE image attachment: watches a provider that fetches the
/// ciphertext and decrypts it to bytes, then shows it (tap to view full-screen).
/// Silent on decrypt failure (an epoch key the viewer doesn't hold).
class ChatAttachment extends ConsumerWidget {
  const ChatAttachment({super.key, required this.provider});
  final ProviderListenable<AsyncValue<Uint8List?>> provider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(provider).when(
          loading: () => Container(
            height: 120,
            decoration: BoxDecoration(
              color: context.tokens.board,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(
              child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
            ),
          ),
          error: (_, __) => const SizedBox.shrink(),
          data: (bytes) {
            if (bytes == null) return const SizedBox.shrink();
            return GestureDetector(
              onTap: () => showDialog<void>(
                context: context,
                builder: (context) => Dialog(
                  clipBehavior: Clip.antiAlias,
                  child: InteractiveViewer(child: Image.memory(bytes)),
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.memory(bytes,
                    height: 160, fit: BoxFit.cover, gaplessPlayback: true),
              ),
            );
          },
        );
  }
}
