import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import { loadBotConfig } from '../lib/config.js';
import { disableLockdown, enableLockdown, planLockdown, readOverwrites } from '../lib/lockdown.js';
import * as P from '../lib/permissions.js';
import { Store } from '../lib/store.js';

const GUILD = '100000000000000001';
const BOT = '100000000000000002';
const OWNER = '100000000000000003';
const STAFF = '100000000000000004';
const MEMBERS = '100000000000000005';
const cfg = { ownerIds: [OWNER], staffRoleIds: [STAFF] };

test('permission constants match discord.js', () => {
  const pairs = {
    VIEW_CHANNEL: 'ViewChannel', SEND_MESSAGES: 'SendMessages', READ_MESSAGE_HISTORY: 'ReadMessageHistory', ATTACH_FILES: 'AttachFiles',
    EMBED_LINKS: 'EmbedLinks', ADD_REACTIONS: 'AddReactions', MANAGE_CHANNELS: 'ManageChannels', MANAGE_ROLES: 'ManageRoles',
    SEND_MESSAGES_IN_THREADS: 'SendMessagesInThreads', CREATE_PUBLIC_THREADS: 'CreatePublicThreads', CREATE_PRIVATE_THREADS: 'CreatePrivateThreads',
  };
  for (const [ours, theirs] of Object.entries(pairs)) assert.equal(P[ours], PermissionFlagsBits[theirs], ours);
});

function fakeChannel(id, name, overwrites, opts = {}) {
  const cache = new Map();
  const put = (o) => cache.set(o.id, { id: o.id, type: o.type, allow: { bitfield: o.allow }, deny: { bitfield: o.deny } });
  overwrites.forEach(put);
  const channel = {
    id, name, type: 0, parentId: null, manageable: opts.manageable ?? true,
    permissionOverwrites: {
      cache,
      async set(list) {
        opts.onSet?.();
        if (opts.failSet) throw new Error('Missing Permissions');
        cache.clear();
        list.forEach(put);
      },
    },
  };
  return channel;
}

function fakeGuild(channels) {
  const map = new Map(channels.map((c) => [c.id, c]));
  return {
    id: GUILD, rulesChannelId: null, publicUpdatesChannelId: null, roles: { cache: new Map() },
    channels: {
      async fetch(id) {
        if (id === undefined) return new Map(map);
        if (!map.has(id)) throw new Error('Unknown Channel');
        return map.get(id);
      },
    },
    map,
  };
}

const role = (id, allow = 0n, deny = 0n) => ({ id, type: P.ROLE, allow, deny });
const member = (id, allow = 0n, deny = 0n) => ({ id, type: P.MEMBER, allow, deny });

function sampleGuild(extra = {}) {
  return fakeGuild([
    fakeChannel('200000000000000001', 'general', [role(GUILD, P.VIEW_CHANNEL | P.SEND_MESSAGES)]),
    fakeChannel('200000000000000002', 'members-only', [role(GUILD, 0n, P.VIEW_CHANNEL), role(MEMBERS, P.VIEW_CHANNEL | P.SEND_MESSAGES)]),
    fakeChannel('200000000000000003', 'dm-with-user', [member('300000000000000001', P.VIEW_CHANNEL), role(GUILD, 0n, P.SEND_MESSAGES)]),
    fakeChannel('200000000000000004', 'no-overwrites', []),
    ...(extra.channels ?? []),
  ]);
}

function tmpStore() {
  return new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'sv2-bot-')));
}

const snapshotOf = (guild) => JSON.stringify([...guild.map.values()].map((c) => [c.id, readOverwrites(c).map((o) => [o.id, o.type, String(o.allow), String(o.deny)]).sort()]));

test('lockedOverwrites hides everyone, removes explicit views, and keeps staff, owner and bot able to see', () => {
  const before = [role(GUILD, P.VIEW_CHANNEL), role(MEMBERS, P.VIEW_CHANNEL | P.SEND_MESSAGES), member('300000000000000001', P.VIEW_CHANNEL)];
  const after = P.lockedOverwrites(before, { everyoneId: GUILD, keepRoleIds: [STAFF], keepMemberIds: [OWNER, BOT] });
  const get = (id) => after.find((o) => o.id === id);
  assert.ok(get(GUILD).deny & P.VIEW_CHANNEL);
  assert.equal(get(GUILD).allow & P.VIEW_CHANNEL, 0n);
  assert.equal(get(MEMBERS).allow & P.VIEW_CHANNEL, 0n);
  assert.ok(get(MEMBERS).deny & P.VIEW_CHANNEL);
  assert.ok(get(MEMBERS).allow & P.SEND_MESSAGES, 'other bits stay untouched');
  assert.ok(get('300000000000000001').deny & P.VIEW_CHANNEL);
  for (const id of [STAFF, OWNER, BOT]) {
    assert.ok(get(id).allow & P.VIEW_CHANNEL, id);
    assert.equal(get(id).deny & P.VIEW_CHANNEL, 0n, id);
  }
});

test('lockedOverwrites does not change its input and is idempotent', () => {
  const before = [role(GUILD, P.VIEW_CHANNEL)];
  const who = { everyoneId: GUILD, keepRoleIds: [STAFF], keepMemberIds: [BOT] };
  const once = P.lockedOverwrites(before, who);
  assert.equal(before[0].allow, P.VIEW_CHANNEL);
  assert.deepEqual(P.diffOverwrites(once, P.lockedOverwrites(once, who)), []);
});

test('lockdown on then off restores every channel exactly', async () => {
  const guild = sampleGuild();
  const store = tmpStore();
  const original = snapshotOf(guild);
  const on = await enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} });
  assert.equal(on.failures.length, 0);
  assert.equal(on.changed, 4);
  assert.notEqual(snapshotOf(guild), original);
  for (const ch of guild.map.values()) {
    const everyone = readOverwrites(ch).find((o) => o.id === GUILD);
    assert.ok(everyone.deny & P.VIEW_CHANNEL, `${ch.name} hidden from everyone`);
  }
  assert.equal(store.state().lockdown.active, true);

  const off = await disableLockdown({ guild, store, log: () => {} });
  assert.equal(off.failures.length, 0);
  assert.equal(snapshotOf(guild), original, 'permissions are byte-for-byte what they were');
  assert.equal(store.state().lockdown.active, false);
});

test('the snapshot is on disk before the first channel is changed', async () => {
  const store = tmpStore();
  let seenOnFirstWrite = null;
  const guild = sampleGuild({
    channels: [fakeChannel('200000000000000009', 'probe', [], {
      onSet: () => { seenOnFirstWrite ??= fs.readdirSync(path.join(store.dir, 'snapshots')).length; },
    })],
  });
  await enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} });
  assert.equal(seenOnFirstWrite, 1);
});

test('a second lockdown is refused so the snapshot cannot be overwritten with a locked state', async () => {
  const guild = sampleGuild();
  const store = tmpStore();
  await enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} });
  await assert.rejects(() => enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} }), /already active/);
  assert.equal(fs.readdirSync(path.join(store.dir, 'snapshots')).length, 1);
});

test('nothing is changed when the bot cannot edit a channel', async () => {
  const guild = sampleGuild({ channels: [fakeChannel('200000000000000008', 'staff-only', [], { manageable: false })] });
  const store = tmpStore();
  const before = snapshotOf(guild);
  await assert.rejects(() => enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} }), /staff-only/);
  assert.equal(snapshotOf(guild), before);
  assert.equal(store.state().lockdown.active, false);
});

test('a channel that fails to lock is reported, and restore still brings back the rest', async () => {
  const guild = sampleGuild({ channels: [fakeChannel('200000000000000007', 'flaky', [role(GUILD, P.VIEW_CHANNEL)], { failSet: true })] });
  const store = tmpStore();
  const original = snapshotOf(guild);
  const on = await enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} });
  assert.deepEqual(on.failures.map((f) => f.name), ['flaky']);
  const off = await disableLockdown({ guild, store, log: () => {} });
  assert.equal(snapshotOf(guild), original);
  assert.equal(off.failures.length, 0, 'the flaky channel was never changed, so it already matches');
});

test('restore reports channels deleted during the lockdown and keeps going', async () => {
  const guild = sampleGuild();
  const store = tmpStore();
  await enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} });
  guild.map.delete('200000000000000001');
  const off = await disableLockdown({ guild, store, log: () => {} });
  assert.deepEqual(off.missing, ['general']);
  assert.equal(off.failures.length, 0);
});

test('a failed restore keeps the lockdown marked active so it can be retried', async () => {
  const guild = sampleGuild();
  const store = tmpStore();
  await enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} });
  guild.map.get('200000000000000002').permissionOverwrites.set = async () => { throw new Error('Missing Access'); };
  const off = await disableLockdown({ guild, store, log: () => {} });
  assert.equal(off.failures.length, 1);
  assert.equal(store.state().lockdown.active, true);
  assert.equal(store.state().lockdown.phase, 'restore-incomplete');
});

test('community channels and open tickets are never touched', async () => {
  const guild = sampleGuild({ channels: [fakeChannel('200000000000000006', 'announcements', [role(GUILD, P.VIEW_CHANNEL)])] });
  const store = tmpStore();
  const state = store.state();
  state.community = { announcementsId: '200000000000000006' };
  store.saveState(state);
  const plan = await planLockdown(guild, cfg, store.state(), BOT);
  assert.ok(!plan.items.some((i) => i.channel.name === 'announcements'));
  await enableLockdown({ guild, cfg, store, botId: BOT, startedBy: OWNER, log: () => {} });
  assert.equal(String(readOverwrites(guild.map.get('200000000000000006'))[0].allow), String(P.VIEW_CHANNEL));
});

test('config names every missing or malformed variable', () => {
  assert.throws(() => loadBotConfig({}), /DISCORD_BOT_TOKEN is missing[\s\S]*DISCORD_GUILD_ID is missing/);
  assert.throws(() => loadBotConfig({ DISCORD_BOT_TOKEN: 'x', DISCORD_GUILD_ID: '123', OWNER_IDS: 'abc' }), /not a Discord id/);
  const ok = loadBotConfig({ DISCORD_BOT_TOKEN: 'x', DISCORD_GUILD_ID: GUILD, OWNER_IDS: `${OWNER}, ${BOT}` });
  assert.deepEqual(ok.ownerIds, [OWNER, BOT]);
  assert.equal(ok.messageContent, false);
});
