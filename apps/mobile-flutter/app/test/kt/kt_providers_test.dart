import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/chat/chat_crypto.dart';
import 'package:nostragoalus/kt/key_transparency.dart';
import 'package:nostragoalus/kt/kt_providers.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:sodium/sodium_sumo.dart';

import '../api/helpers.dart';
import '../chat/route_adapter.dart';
import '../e2ee/sodium_loader.dart';

Map<String, dynamic> entry(int seq, String prev, String userId, String pub) {
  final e = {
    'seq': seq,
    'prevHash': prev,
    'userId': userId,
    'publicKey': pub,
    'createdAt': 't$seq',
  };
  return {...e, 'entryHash': computeKtEntryHash(e)};
}

void main() {
  late SodiumSumo sodium;
  setUpAll(() async => sodium = await SodiumSumoInit.init(loadLibsodium));

  final e0 = entry(0, ktGenesis, 'peer', 'peer-key-0');
  final e1 = entry(1, e0['entryHash'] as String, 'peer', 'peer-key-1');
  final chain = [e0, e1];
  final trueHead = e1['entryHash'] as String;

  ProviderContainer container(List<Map<String, dynamic>> entries, String servedHead,
      {SecureKv? pins}) {
    final dio = Dio()
      ..httpClientAdapter = RouteAdapter({
        '/api/keys/log': () =>
            Reply(200, {'entries': entries, 'head': {'seq': entries.length - 1, 'hash': servedHead}}),
        '/api/chat/identity': () => Reply(200, {'identity': null}),
      });
    final c = ProviderContainer(overrides: [
      sodiumProvider.overrideWith((ref) async => sodium),
      apiProvider.overrideWithValue(ApiClient(TokenStore(InMemoryKv()), dio: dio)),
      ktPinStoreProvider.overrideWithValue(pins ?? InMemoryKv()),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  test('a chain that agrees with the served head verifies', () async {
    final view = await container(chain, trueHead).read(ktProvider.future);
    expect(view.chainOk, isTrue);
    expect(view.headTampered, isFalse);
    expect(view.headHash, equals(trueHead));
  });

  test('a self-consistent chain under a head of the server\'s choosing does NOT', () async {
    final view = await container(chain, 'a-head-the-server-made-up').read(ktProvider.future);
    expect(view.verification.ok, isTrue); // the chain alone still walks
    expect(view.chainOk, isFalse);
    // Displaying the served head would hand the server the value the user
    // compares out of band.
    expect(view.headHash, equals(trueHead));
  });

  test('an empty log is not a verified log', () async {
    final view = await container(const [], 'whatever').read(ktProvider.future);
    expect(view.chainOk, isFalse);
    expect(view.entryCount, equals(0));
  });

  test('the head is pinned, and a later shorter log is flagged as rewritten', () async {
    final pins = InMemoryKv();
    final first = await container(chain, trueHead, pins: pins).read(ktProvider.future);
    expect(first.headTampered, isFalse);

    final rewritten = [entry(0, ktGenesis, 'peer', 'substituted-key')];
    final second = await container(rewritten, rewritten[0]['entryHash'] as String, pins: pins)
        .read(ktProvider.future);
    expect(second.headTampered, isTrue);
  });

  test('check() reports ok / absent / mismatch against the log', () async {
    final view = await container(chain, trueHead).read(ktProvider.future);
    expect(view.check('peer', 'peer-key-1'), equals(KtCheck.ok));
    expect(view.check('peer', 'a-substituted-key'), equals(KtCheck.mismatch));
    expect(view.check('nobody', 'any-key'), equals(KtCheck.absent));
  });

  test('check() reports unknown while the log itself does not verify', () async {
    final view = await container(chain, 'bogus').read(ktProvider.future);
    expect(view.check('peer', 'peer-key-1'), equals(KtCheck.unknown));
  });
}
