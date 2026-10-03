import { test } from 'node:test';
import assert from 'node:assert/strict';

test('community user list parser accepts { users: [] } and legacy arrays', async () => {
  const { parseCommunityUsersPayload } = await import('../src/lib/communityUsers.js');

  assert.deepEqual(parseCommunityUsersPayload({ users: [{ id: 1, name: 'A' }] }), [{ id: 1, name: 'A' }]);
  assert.deepEqual(parseCommunityUsersPayload([{ id: 2, name: 'B' }]), [{ id: 2, name: 'B' }]);
  assert.equal(parseCommunityUsersPayload({ message: 'nope' }), null);
  assert.equal(parseCommunityUsersPayload('<html></html>'), null);
});
