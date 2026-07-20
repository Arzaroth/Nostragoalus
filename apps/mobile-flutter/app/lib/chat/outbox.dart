import 'package:flutter_riverpod/flutter_riverpod.dart';

/// One optimistic outgoing message: shown immediately as "Sending…", removed
/// when the real message lands, or marked failed (kept with Retry/Discard) so the
/// text is never lost. `send` is the room-specific send closure, re-run on retry.
class OutboxEntry {
  const OutboxEntry({
    required this.localId,
    required this.roomId,
    required this.text,
    required this.send,
    this.failed = false,
  });
  final String localId;
  final String roomId; // 'league:<id>' | 'dm:<threadId>' | 'thread:<leagueId>:<rootId>'
  final String text;
  final Future<void> Function() send;
  final bool failed;

  OutboxEntry copyWith({bool? failed}) => OutboxEntry(
        localId: localId,
        roomId: roomId,
        text: text,
        send: send,
        failed: failed ?? this.failed,
      );
}

/// A process-wide send outbox shared by league chat, DMs and thread replies.
/// In-memory (a pending message survives navigation, not a full app restart).
class ChatOutbox extends StateNotifier<List<OutboxEntry>> {
  ChatOutbox() : super(const []);
  int _seq = 0;

  List<OutboxEntry> forRoom(String roomId) =>
      state.where((e) => e.roomId == roomId).toList();

  Future<void> enqueue(String roomId, String text, Future<void> Function() send) async {
    final id = 'local-${_seq++}';
    state = [...state, OutboxEntry(localId: id, roomId: roomId, text: text, send: send)];
    await _run(id);
  }

  Future<void> retry(String localId) async {
    state = [for (final e in state) e.localId == localId ? e.copyWith(failed: false) : e];
    await _run(localId);
  }

  void discard(String localId) =>
      state = state.where((e) => e.localId != localId).toList();

  Future<void> _run(String localId) async {
    OutboxEntry? entry;
    for (final e in state) {
      if (e.localId == localId) {
        entry = e;
        break;
      }
    }
    if (entry == null) return;
    try {
      await entry.send();
      state = state.where((e) => e.localId != localId).toList();
    } catch (_) {
      state = [for (final e in state) e.localId == localId ? e.copyWith(failed: true) : e];
    }
  }
}

final chatOutboxProvider =
    StateNotifierProvider<ChatOutbox, List<OutboxEntry>>((ref) => ChatOutbox());
