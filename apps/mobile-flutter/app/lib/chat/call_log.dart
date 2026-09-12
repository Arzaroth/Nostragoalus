import '../api/models.gen.dart';
import '../voice/voice_mesh.dart';

/// Call lines for a chat room, interleaved into the message timeline the way the
/// web's ChatPanel does: a room's calls are part of its story, and a chat that
/// shows only the messages loses "you called and I missed it" entirely.

/// How long the call ran, or null while it is still running. Rendered by the
/// same [formatCallDuration] the in-call bar uses, so a call reads the same in
/// the timeline as it did on the clock.
String? callDuration(Call call) {
  final ended = DateTime.tryParse(call.endedAt ?? '');
  final started = DateTime.tryParse(call.startedAt);
  if (ended == null || started == null) return null;
  return formatCallDuration(ended.difference(started).inSeconds);
}

/// The i18n key and `{name}`/`{duration}` values for one call line, or null for
/// a status this build does not know. The generated enum carries an `unknown`
/// member so a server that learns a new status does not crash an old client;
/// inventing a line for it would put a wrong sentence in the timeline instead.
(String, Map<String, Object?>)? callLineText(Call call, String unknownName) {
  final name = call.initiatorName ?? unknownName;
  return switch (call.status) {
    CallStatusValue.missed => ('voice.log.missed', {'name': name}),
    CallStatusValue.ongoing => ('voice.log.ongoing', {'name': name}),
    CallStatusValue.ended => (
        'voice.log.ended',
        {'name': name, 'duration': callDuration(call) ?? ''},
      ),
    CallStatusValue.unknown => null,
  };
}

/// Anchor each call before the first message newer than it, with calls newer
/// than every message trailing the list.
///
/// Both inputs are chronological, so this is one merge pass. It compares epoch
/// millis rather than the ISO strings: a serialization difference between the
/// two sources would silently mis-anchor a string compare.
({Map<String, List<Call>> before, List<Call> tail}) anchorCalls(
  List<Call> calls,
  List<({String id, String createdAt})> messages,
) {
  final before = <String, List<Call>>{};
  final tail = <Call>[];
  var i = 0;
  for (final c in calls) {
    final started = DateTime.tryParse(c.startedAt)?.millisecondsSinceEpoch;
    if (started == null) continue;
    // A message whose timestamp does not parse cannot anchor anything, so it
    // sorts as the oldest thing there is and the scan walks straight past it -
    // the calls around it still land on either side of the messages that DO
    // place, rather than piling up behind an unreadable one.
    while (i < messages.length &&
        (DateTime.tryParse(messages[i].createdAt)?.millisecondsSinceEpoch ?? 0) <= started) {
      i += 1;
    }
    if (i < messages.length) {
      before.putIfAbsent(messages[i].id, () => []).add(c);
    } else {
      tail.add(c);
    }
  }
  return (before: before, tail: tail);
}
