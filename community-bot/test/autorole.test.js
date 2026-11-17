import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBotConfig } from '../lib/config.js';
import { giveRole, needsRole, startSweep, sweepMembers } from '../lib/autorole.js';

const ROLE = '200000000000000001';

function fakeMember(id, { bot = false, pending = false, roles = [], failWith = null } = {}) {
  const cache = new Set(roles);
  return {
    id,
    user: { bot },
    pending,
    roles: {
      cache: { has: (r) => cache.has(r) },
      add: async (r) => {
        if (failWith) throw new Error(failWith);
        cache.add(r);
      },
    },
  };
}

function fakeGuild(members, role = { id: ROLE, name: 'Members', editable: true }) {
  return {
    roles: { cache: new Map(role ? [[ROLE, role]] : []), fetch: async () => null },
    members: { fetch: async () => new Map(members.map((m) => [m.id, m])) },
  };
}

const noLog = () => {};

test('needsRole skips bots, pending members and members that already have the role', () => {
  assert.equal(needsRole(fakeMember('1'), ROLE), true);
  assert.equal(needsRole(fakeMember('2', { bot: true }), ROLE), false);
  assert.equal(needsRole(fakeMember('3', { pending: true }), ROLE), false);
  assert.equal(needsRole(fakeMember('4', { roles: [ROLE] }), ROLE), false);
});

test('giveRole adds the role once and reports a failure without throwing', async () => {
  const member = fakeMember('1');
  assert.equal(await giveRole(member, ROLE, noLog), true);
  assert.equal(await giveRole(member, ROLE, noLog), false);
  const logs = [];
  assert.equal(await giveRole(fakeMember('2', { failWith: 'Missing Permissions' }), ROLE, (m) => logs.push(m)), false);
  assert.match(logs[0], /Missing Permissions/);
});

test('sweep gives the role to every human who lacks it and counts them', async () => {
  const members = [fakeMember('1'), fakeMember('2', { roles: [ROLE] }), fakeMember('3', { bot: true }), fakeMember('4'), fakeMember('5', { pending: true })];
  const result = await sweepMembers(fakeGuild(members), ROLE, noLog);
  assert.deepEqual(result, { checked: 5, added: 2 });
  assert.equal(members[0].roles.cache.has(ROLE), true);
  assert.equal(members[3].roles.cache.has(ROLE), true);
  assert.equal(members[2].roles.cache.has(ROLE), false);
  assert.equal(members[4].roles.cache.has(ROLE), false);
});

test('sweep reports a missing role or a role above the bot instead of failing', async () => {
  assert.equal((await sweepMembers(fakeGuild([], null), ROLE, noLog)).problem, 'role missing');
  const above = fakeGuild([fakeMember('1')], { id: ROLE, name: 'Members', editable: false });
  assert.equal((await sweepMembers(above, ROLE, noLog)).problem, 'role above bot');
});

test('the repeating sweep runs at once, again on the interval, and survives an error', async () => {
  let calls = 0;
  const guild = fakeGuild([]);
  guild.members.fetch = async () => {
    calls += 1;
    if (calls === 2) throw new Error('gateway hiccup');
    return new Map();
  };
  const logs = [];
  const timer = startSweep(guild, ROLE, (m) => logs.push(m), 20);
  await new Promise((resolve) => setTimeout(resolve, 110));
  clearInterval(timer);
  assert.ok(calls >= 3, `expected at least 3 runs, got ${calls}`);
  assert.ok(logs.some((l) => /gateway hiccup/.test(l)));
});

test('MEMBER_ROLE_ID is optional and read from the environment', () => {
  const base = { DISCORD_BOT_TOKEN: 'x', DISCORD_GUILD_ID: '100000000000000001' };
  assert.equal(loadBotConfig(base).memberRoleId, '');
  assert.equal(loadBotConfig({ ...base, MEMBER_ROLE_ID: ROLE }).memberRoleId, ROLE);
});
