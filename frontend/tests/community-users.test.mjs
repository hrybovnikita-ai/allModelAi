import { test } from 'node:test';
import assert from 'node:assert/strict';

test('community user list parser accepts { users: [] } and legacy arrays', async () => {
  const { parseCommunityUsersPayload } = await import('../src/lib/communityUsers.js');

  assert.deepEqual(parseCommunityUsersPayload({ users: [{ id: 1, name: 'A' }] }), [{ id: 1, name: 'A' }]);
  assert.deepEqual(parseCommunityUsersPayload([{ id: 2, name: 'B' }]), [{ id: 2, name: 'B' }]);
  assert.equal(parseCommunityUsersPayload({ message: 'nope' }), null);
  assert.equal(parseCommunityUsersPayload('<html></html>'), null);
});

test('community parser hides internal and automated test account names', async () => {
  const { parseCommunityUsersPayload, isPublicCommunityDisplayName } = await import('../src/lib/communityUsers.js');

  assert.equal(isPublicCommunityDisplayName('Nikita Hrybov'), true);
  assert.equal(isPublicCommunityDisplayName('Video Tester'), false);
  assert.equal(isPublicCommunityDisplayName('MH Auth'), false);

  const filtered = parseCommunityUsersPayload({
    users: [
      { id: 1, name: 'Nikita Hrybov' },
      { id: 2, name: 'Video Tester' },
      { id: 3, name: 'Claude Repro' },
      { id: 4, name: 'Artem Muzichenko' },
    ],
  });

  assert.deepEqual(filtered, [
    { id: 1, name: 'Nikita Hrybov' },
    { id: 4, name: 'Artem Muzichenko' },
  ]);
});
