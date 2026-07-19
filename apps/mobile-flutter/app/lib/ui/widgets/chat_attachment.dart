import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Renders one E2EE image attachment: watches a provider that fetches the
/// ciphertext and decrypts it to bytes, then shows it (tap to view full-screen).
/// Silent on decrypt failure (an epoch key the viewer doesn't hold).
class ChatAttachment extends ConsumerWidget {
  const ChatAttachment({super.key, required this.provider});
  final ProviderListenable<AsyncValue<Uint8List?>> provider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(provider).when(
          loading: () => const SizedBox(
            height: 120,
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, __) => const SizedBox.shrink(),
          data: (bytes) {
            if (bytes == null) return const SizedBox.shrink();
            return GestureDetector(
              onTap: () => showDialog<void>(
                context: context,
                builder: (context) => Dialog(
                  child: InteractiveViewer(child: Image.memory(bytes)),
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(bytes,
                    height: 160, fit: BoxFit.cover, gaplessPlayback: true),
              ),
            );
          },
        );
  }
}
