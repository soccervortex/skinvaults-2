// Server lockdown with an exact way back.
// Order matters: the snapshot is written to disk and read back BEFORE the first permission is changed, and a second
// lockdown is refused while one is active, so the snapshot can never be taken from an already locked server.

import fs from 'node:fs';
import path from 'node:path';
import { diffOverwrites, lockedOverwrites, parseOverwrites, serializeOverwrites } from './permissions.js';

const ADMINISTRATOR = 1n << 3n;

export function readOverwrites(channel) {
  return [...channel.permissionOverwrites.cache.values()].map((o) => ({
    id: o.id,
    type: o.type,
    allow: o.allow.bitfield,
    deny: o.deny.bitfield,
  }));
}

/** Ids the lockdown must never touch: the community channels we manage and open feedback tickets. */
export function managedChannelIds(state) {
  const c = state.community ?? {};
  const ids = [c.categoryId, c.announcementsId, c.chatId, c.feedbackId, c.logId, c.ticketsCategoryId];
  ids.push(...Object.values(state.tickets ?? {}));
  return new Set(ids.filter(Boolean));
}

function who(guild, cfg, botId) {
  return { everyoneId: guild.id, keepRoleIds: cfg.staffRoleIds, keepMemberIds: [...new Set([...cfg.ownerIds, botId])] };
}

/** Works out what a lockdown would do, without changing anything. */
export async function planLockdown(guild, cfg, state, botId) {
  const channels = [...(await guild.channels.fetch()).values()].filter(Boolean);
  const skip = managedChannelIds(state);
  const keep = who(guild, cfg, botId);
  const items = [];
  const blocked = [];
  for (const channel of channels) {
    if (skip.has(channel.id)) continue;
    if (!channel.manageable) {
      blocked.push(channel.name);
      continue;
    }
    const before = readOverwrites(channel);
    const after = lockedOverwrites(before, keep);
    items.push({ channel, before, after, changed: diffOverwrites(before, after).length > 0 });
  }

  const warnings = [];
  for (const [label, id] of [['rules channel', guild.rulesChannelId], ['community updates channel', guild.publicUpdatesChannelId]]) {
    if (id && items.some((i) => i.channel.id === id)) warnings.push(`The ${label} must stay visible to everyone, so Discord may refuse to hide it.`);
  }
  const admins = [...guild.roles.cache.values()].filter((r) => (r.permissions.bitfield & ADMINISTRATOR) && !r.managed && r.id !== guild.id);
  if (admins.length) warnings.push(`Roles with Administrator still see everything: ${admins.map((r) => r.name).join(', ')}.`);
  return { items, blocked, warnings };
}

export function snapshotFileName(now = new Date()) {
  return `snapshots/${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

export async function enableLockdown({ guild, cfg, store, botId, startedBy, log }) {
  const state = store.state();
  if (state.lockdown?.active) throw new Error('Lockdown is already active. Run /lockdown off first, or /lockdown status to see its state.');

  const plan = await planLockdown(guild, cfg, state, botId);
  if (plan.blocked.length) throw new Error(`The bot cannot edit these channels, so nothing was changed: ${plan.blocked.join(', ')}. Give the bot Manage Roles and Manage Channels (and a role above the others), then try again.`);

  const snapshot = {
    version: 1,
    takenAt: new Date().toISOString(),
    guildId: guild.id,
    everyoneId: guild.id,
    channels: plan.items.map((i) => ({
      id: i.channel.id,
      name: i.channel.name,
      type: i.channel.type,
      parentId: i.channel.parentId ?? null,
      overwrites: serializeOverwrites(i.before),
    })),
  };
  const file = snapshotFileName();
  store.write(file, snapshot);
  const readBack = store.read(file, null);
  if (!readBack || readBack.channels.length !== snapshot.channels.length) throw new Error('The snapshot could not be read back from disk, so nothing was changed.');

  state.lockdown = { active: true, phase: 'applying', snapshotFile: file, startedAt: snapshot.takenAt, startedBy, failures: [] };
  store.saveState(state);
  log(`lockdown: snapshot ${file} saved with ${snapshot.channels.length} channels`);

  const failures = [];
  let changed = 0;
  for (const item of plan.items) {
    if (!item.changed) continue;
    try {
      await item.channel.permissionOverwrites.set(item.after, 'SkinVaults lockdown');
      changed += 1;
    } catch (err) {
      failures.push({ id: item.channel.id, name: item.channel.name, error: String(err.message ?? err).slice(0, 200) });
    }
  }
  state.lockdown.phase = 'locked';
  state.lockdown.failures = failures;
  store.saveState(state);
  log(`lockdown: ${changed} channels locked, ${failures.length} failed`);
  return { snapshotFile: file, total: plan.items.length, changed, failures, warnings: plan.warnings };
}

export async function disableLockdown({ guild, store, log }) {
  const state = store.state();
  if (!state.lockdown?.active) throw new Error('Lockdown is not active, so there is nothing to restore.');
  const file = state.lockdown.snapshotFile;
  const snapshot = store.read(file, null);
  if (!snapshot || snapshot.guildId !== guild.id) throw new Error(`Snapshot ${file} is missing or belongs to another server. Nothing was changed.`);

  const missing = [];
  const failures = [];
  let restored = 0;
  for (const saved of snapshot.channels) {
    const expected = parseOverwrites(saved.overwrites);
    let live = null;
    try {
      live = await guild.channels.fetch(saved.id, { force: true });
    } catch {
      live = null;
    }
    if (!live) {
      missing.push(saved.name);
      continue;
    }
    try {
      if (diffOverwrites(expected, readOverwrites(live)).length > 0) {
        await live.permissionOverwrites.set(expected, 'SkinVaults lockdown ended');
        restored += 1;
      }
      const check = await guild.channels.fetch(saved.id, { force: true });
      const problems = diffOverwrites(expected, readOverwrites(check));
      if (problems.length) failures.push({ id: saved.id, name: saved.name, error: problems.join('; ') });
    } catch (err) {
      failures.push({ id: saved.id, name: saved.name, error: String(err.message ?? err).slice(0, 200) });
    }
  }

  if (failures.length === 0) {
    state.lockdown = { active: false, lastRestoredAt: new Date().toISOString(), snapshotFile: file };
  } else {
    state.lockdown.phase = 'restore-incomplete';
    state.lockdown.failures = failures;
  }
  store.saveState(state);
  log(`lockdown off: ${restored} channels restored, ${missing.length} deleted since, ${failures.length} failed`);
  return { snapshotFile: file, total: snapshot.channels.length, restored, missing, failures };
}

export function listSnapshots(store) {
  try {
    return fs.readdirSync(path.join(store.dir, 'snapshots')).sort();
  } catch {
    return [];
  }
}
