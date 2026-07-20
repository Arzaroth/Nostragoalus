import 'dart:async';
import 'dart:convert';

import 'package:nostragoalus/live/live_service.dart';

/// An in-memory [LiveChannel]: the test plays the server side.
class FakeChannel implements LiveChannel {
  final _incoming = StreamController<dynamic>();
  final List<Map<String, dynamic>> sent = [];
  bool closed = false;

  @override
  Stream<dynamic> get stream => _incoming.stream;

  @override
  void send(String data) => sent.add(jsonDecode(data) as Map<String, dynamic>);

  @override
  Future<void> close() async {
    closed = true;
    await drop();
  }

  /// Push a server frame at the client.
  void emit(Map<String, dynamic> frame) => _incoming.add(jsonEncode(frame));

  void emitRaw(String data) => _incoming.add(data);

  /// The socket goes away (server restart, carrier drop).
  Future<void> drop() async {
    if (!_incoming.isClosed) await _incoming.close();
  }

  List<Map<String, dynamic>> ofType(String type) =>
      sent.where((f) => f['type'] == type).toList();
}

/// Records every channel the service opens, newest last.
class FakeChannels {
  final List<FakeChannel> opened = [];

  LiveChannel factory(Uri url, Map<String, String>? headers) {
    final channel = FakeChannel();
    opened.add(channel);
    return channel;
  }

  FakeChannel get last => opened.last;
  int get count => opened.length;
}

/// Let pending microtasks and short timers run.
Future<void> settle([int ms = 5]) => Future<void>.delayed(Duration(milliseconds: ms));
