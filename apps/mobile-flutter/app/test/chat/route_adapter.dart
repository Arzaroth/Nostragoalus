import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../api/helpers.dart';

/// Routes requests by path so a test can answer the two or three endpoints it
/// cares about without depending on call order (unlike the sequential
/// [FakeAdapter]).
class RouteAdapter implements HttpClientAdapter {
  RouteAdapter(this.routes);
  final Map<String, Reply Function()> routes;
  final List<String> calls = [];

  /// The query parameters of the last request to each path, for asserting how a
  /// read was scoped without threading a whole [FakeAdapter] through.
  final Map<String, Map<String, dynamic>> queries = {};

  @override
  Future<ResponseBody> fetch(
      RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add('${options.method} ${options.path}');
    queries[options.path] = options.queryParameters;
    final r = routes[options.path]?.call() ?? Reply(404, {'error': 'no route ${options.path}'});
    return ResponseBody.fromString(jsonEncode(r.body), r.status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}
