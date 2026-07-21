import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';

import 'build_client.dart';
import 'helpers.dart';

const _other = {
  'userId': 'u2',
  'name': 'Other',
  'image': null,
  'publicKey': 'PK',
};

void main() {
  group('reads', () {
    test('dmThreads parses the thread list', () async {
      final (api, adapter) = buildApi([
        Reply(200, {
          'threads': [
            {
              'threadId': 't1',
              'other': {'id': 'u2', 'name': 'Other', 'image': null},
              'lastMessageAt': null,
              'unread': 2,
              'myWrappedKey': 'WK',
            },
          ],
        }),
      ]);

      final res = await api.dmThreads();
      expect(res.threads.single.threadId, 't1');
      expect(res.threads.single.unread, 2);
      expectRequest(adapter, method: 'GET', path: '/api/dm/threads');
    });

    test('dmRecipients parses the recipient list', () async {
      final (api, adapter) = buildApi([
        Reply(200, {
          'recipients': [
            {'userId': 'u2', 'name': 'Other', 'image': null, 'shared': true},
          ],
        }),
      ]);

      final res = await api.dmRecipients();
      expect(res.recipients.single.userId, 'u2');
      expect(res.recipients.single.shared, isTrue);
      expectRequest(adapter, method: 'GET', path: '/api/dm/recipients');
    });

    test('dmPublicKey asks for the user and unwraps the key', () async {
      final (api, adapter) = buildApi([
        Reply(200, {'identity': _other}),
      ]);

      expect(await api.dmPublicKey('u2'), 'PK');
      expectRequest(adapter,
          method: 'GET', path: '/api/dm/identity', query: {'userId': 'u2'});
    });

    test('dmThread parses the thread envelope', () async {
      final (api, adapter) = buildApi([
        Reply(200, {
          'thread': {
            'threadId': 't1',
            'epoch': 1,
            'other': _other,
            'myWrappedKeys': [
              {'epoch': 1, 'wrappedKey': 'WK'},
            ],
            'otherMissingCurrentKey': false,
            'otherLastReadAt': null,
          },
        }),
      ]);

      final res = await api.dmThread('t1');
      expect(res.thread.other.publicKey, 'PK');
      expect(res.thread.myWrappedKeys.single.wrappedKey, 'WK');
      expectRequest(adapter, method: 'GET', path: '/api/dm/t1');
    });

    test('dmMessages reads the thread page', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'messages': [], 'readMarker': null}),
      ]);

      expect((await api.dmMessages('t1')).messages, isEmpty);
      expectRequest(adapter, method: 'GET', path: '/api/dm/t1/messages');
    });

    test('dmAttachment sends the image index as a query', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'ciphertext': 'AAA', 'epoch': 4}),
      ]);

      final att = await api.dmAttachment('t1', 'm1', 2);
      expect(att.ciphertext, 'AAA');
      expect(att.epoch.toInt(), 4);
      expectRequest(adapter,
          method: 'GET', path: '/api/dm/t1/attachments/m1', query: {'idx': '2'});
    });

    test('dmThreads throws on a non-2xx instead of showing no threads', () async {
      final (api, _) = buildFailing(503);
      await expectLater(api.dmThreads(), throwsStatus(503));
    });

    test('dmThread throws on a non-2xx', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.dmThread('t1'), throwsStatus(403));
    });

    test('dmMessages throws on a non-2xx', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.dmMessages('t1'), throwsStatus(403));
    });

    test('dmRecipients throws on a non-2xx', () async {
      final (api, _) = buildFailing(401);
      await expectLater(api.dmRecipients(), throwsStatus(401));
    });

    test('dmAttachment throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.dmAttachment('t1', 'm1', 0), throwsStatus(404));
    });
  });

  group('mutations', () {
    test('createDmThread posts the recipient and both wraps', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'threadId': 't9', 'epoch': 1, 'created': true}),
      ]);

      final id = await api.createDmThread('u2', const [
        {'userId': 'u1', 'wrappedKey': 'A'},
        {'userId': 'u2', 'wrappedKey': 'B'},
      ]);

      expect(id, 't9');
      expectRequest(adapter, method: 'POST', path: '/api/dm/threads', body: {
        'recipientId': 'u2',
        'wraps': [
          {'userId': 'u1', 'wrappedKey': 'A'},
          {'userId': 'u2', 'wrappedKey': 'B'},
        ],
      });
    });

    test('sendDm omits an empty image list', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.sendDm('t1', 'cipher', 3, images: const []);

      expectRequest(adapter,
          method: 'POST',
          path: '/api/dm/t1/messages',
          body: {'ciphertext': 'cipher', 'epoch': 3});
    });

    test('sendDm carries the images when there are any', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.sendDm('t1', 'cipher', 3, images: const [
        {'ciphertext': 'IMG', 'byteSize': 12},
      ]);

      expectRequest(adapter, method: 'POST', path: '/api/dm/t1/messages', body: {
        'ciphertext': 'cipher',
        'epoch': 3,
        'images': [
          {'ciphertext': 'IMG', 'byteSize': 12},
        ],
      });
    });

    test('reactDm keeps a null emoji so the reaction can be cleared', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.reactDm('t1', 'm1', null);

      expectRequest(adapter,
          method: 'PUT',
          path: '/api/dm/t1/react',
          body: {'messageId': 'm1', 'emoji': null});
    });

    test('markDmRead posts with no body', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.markDmRead('t1');

      expectRequest(adapter, method: 'POST', path: '/api/dm/t1/read');
      expect(adapter.requests.single.data, isNull);
    });

    test('sendDm surfaces a rejected send', () async {
      final (api, _) = buildFailing(422);
      await expectLater(api.sendDm('t1', 'c', 1), throwsStatus(422));
    });

    test('markDmRead surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.markDmRead('t1'), throwsStatus(403));
    });

    test('reactDm surfaces a failure', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.reactDm('t1', 'm1', 'FIRE'), throwsStatus(404));
    });
  });
}
