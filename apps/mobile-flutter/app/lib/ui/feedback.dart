import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../i18n/i18n_scope.dart';
import '../theme/app_theme.dart';

/// The server's own reason for a failure, falling back to the generic string.
/// Without this every catch collapses "email already taken" and "server down"
/// into the same unactionable message.
String apiMessage(BuildContext context, Object error) {
  if (error is ApiException) {
    final body = error.body;
    if (body is Map) {
      for (final key in const ['message', 'statusMessage', 'error']) {
        final value = body[key];
        if (value is String && value.isNotEmpty) return value;
      }
    }
    if (error.message.isNotEmpty) return error.message;
  }
  return context.tr('err.generic');
}

void showToast(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

/// Runs a mutation, snackbars the server's reason on failure and [successKey]
/// on success. Every fire-and-forget `onPressed: () => api.doThing()` should go
/// through this so a failed action is never silent.
Future<bool> runAction(
  BuildContext context,
  Future<void> Function() action, {
  String? successKey,
}) async {
  try {
    await action();
    if (context.mounted && successKey != null) showToast(context, context.tr(successKey));
    return true;
  } catch (e) {
    if (context.mounted) showToast(context, apiMessage(context, e));
    return false;
  }
}

/// Confirmation before a destructive action. [message] and [confirmLabel] are
/// already-translated strings.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  bool danger = true,
}) async {
  final live = context.tokens.live;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text(ctx.tr('common.cancel')),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          style: danger ? TextButton.styleFrom(foregroundColor: live) : null,
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}
