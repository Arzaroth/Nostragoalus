import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../i18n/i18n_scope.dart';
import '../state/providers.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'widgets/panel.dart';

/// Edit the display name and avatar. Avatar is uploaded as a data: URL (the same
/// contract as the web account page's update-user call).
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});
  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  late final TextEditingController _name;
  String? _imageDataUrl;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authControllerProvider).valueOrNull;
    _name = TextEditingController(text: user?.name ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, maxWidth: 512, maxHeight: 512, imageQuality: 85);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    final ext = picked.name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    setState(() => _imageDataUrl = 'data:image/$ext;base64,${base64Encode(bytes)}');
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final name = _name.text.trim();
      await ref.read(apiProvider).updateProfile(
            name: name.isEmpty ? null : name,
            imageDataUrl: _imageDataUrl,
          );
      ref.invalidate(authControllerProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showToast(context, apiMessage(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    final initial = (user?.name ?? user?.email ?? '?').characters.first.toUpperCase();
    final scheme = Theme.of(context).colorScheme;
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('profile.editTitle'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Center(
            child: Stack(
              alignment: AlignmentDirectional.bottomEnd,
              children: [
                CircleAvatar(
                  radius: 44,
                  backgroundColor: scheme.primaryContainer,
                  backgroundImage: _imageDataUrl != null
                      ? MemoryImage(base64Decode(_imageDataUrl!.split(',').last))
                      : null,
                  child: _imageDataUrl == null
                      ? Text(initial,
                          style: t.score(36, weight: FontWeight.w600, color: scheme.onPrimaryContainer))
                      : null,
                ),
                IconButton.filled(
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  tooltip: context.tr('account.changeAvatar'),
                  onPressed: _pick,
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Panel(
            margin: EdgeInsets.zero,
            padding: const EdgeInsets.all(16),
            dividers: false,
            children: [
              TextField(
                controller: _name,
                autofillHints: const [AutofillHints.name],
                decoration: InputDecoration(labelText: context.tr('profile.displayName')),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(context.tr('common.save')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
