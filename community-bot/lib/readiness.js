// "Is the server really ready for a lockdown?" A read-only check, plus the helpers that switch Onboarding off and on.
// The visibility maths is pure (no Discord objects), so it is tested with plain data. Discord's own rule is applied:
// base permissions of @everyone and the member's roles, Administrator sees everything, then the channel overwrites in the
// order @everyone, roles (deny first, then allow), member.

import { Routes } from 'discord.js';
import { lockedOverwrites, MEMBER, ROLE, VIEW_CHANNEL } from './permissions.js';

const ADMINISTRATOR = 1n << 3n;
const CATEGORY = 4;

export function parseRawChannel(raw) {
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    type: raw.type,
    parentId: raw.parent_id ?? null,
    overwrites: (raw.permission_overwrites ?? []).map((o) => ({ id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) })),
  };
}

export function parseRawRole(raw) {
  return { id: raw.id, name: raw.name, permissions: BigInt(raw.permissions), managed: Boolean(raw.managed), position: raw.position ?? 0 };
}

/** Can a member with these roles see this channel? `roles` must contain the @everyone role (its id is the guild id). */
export function canView({ channel, roles, memberRoleIds, everyoneId, memberId = null }) {
  const byId = new Map(roles.map((r) => [r.id, r]));
  let perms = byId.get(everyoneId)?.permissions ?? 0n;
  for (const id of memberRoleIds) perms |= byId.get(id)?.permissions ?? 0n;
  if (perms & ADMINISTRATOR) return true;

  const find = (id, type) => channel.overwrites.find((o) => o.id === id && o.type === type);
  const everyone = find(everyoneId, ROLE);
  if (everyone) perms = (perms & ~everyone.deny) | everyone.allow;
  let allow = 0n;
  let deny = 0n;
  for (const id of memberRoleIds) {
    const o = find(id, ROLE);
    if (o) {
      allow |= o.allow;
      deny |= o.deny;
    }
  }
  perms = (perms & ~deny) | allow;
  if (memberId) {
    const own = find(memberId, MEMBER);
    if (own) perms = (perms & ~own.deny) | own.allow;
  }
  return (perms & VIEW_CHANNEL) !== 0n;
}

/**
 * What would ordinary members see? One group for "@everyone only" and one per role that does not have Administrator.
 * With `applyLock` the lockdown is simulated on every channel that is not in `leaveAlone`.
 * Returns the names of the channels each group can see, apart from the ones in `allowedIds`.
 */
export function simulateVisibility({ channels, roles, everyoneId, allowedIds, leaveAlone, keep, applyLock }) {
  const view = applyLock
    ? channels.map((c) => (leaveAlone.has(c.id) ? c : { ...c, overwrites: lockedOverwrites(c.overwrites, keep) }))
    : channels;
  const admins = roles.filter((r) => r.id !== everyoneId && (r.permissions & ADMINISTRATOR));
  const normal = roles.filter((r) => r.id !== everyoneId && !(r.permissions & ADMINISTRATOR));
  const groups = [{ label: '@everyone', roleIds: [] }, ...normal.map((r) => ({ label: r.name, roleIds: [r.id] }))];
  const result = groups.map((g) => ({
    label: g.label,
    sees: view.filter((c) => !allowedIds.has(c.id) && canView({ channel: c, roles, memberRoleIds: g.roleIds, everyoneId })),
  }));
  return { groups: result, adminRoles: admins.map((r) => r.name) };
}

const names = (list) => list.map((c) => (c.type === CATEGORY ? `${c.name} (category)` : `#${c.name}`));

/**
 * Looks at the live server. Never changes anything.
 * @returns {{ ok: boolean, blockers: {text: string, manual: boolean}[], notes: string[], sees: string[] }}
 */
export async function analyseReadiness({ guild, state, cfg, botId }) {
  const rest = guild.client.rest;
  const [rawChannels, rawRoles] = await Promise.all([rest.get(Routes.guildChannels(guild.id)), rest.get(Routes.guildRoles(guild.id))]);
  const channels = rawChannels.map(parseRawChannel);
  const roles = rawRoles.map(parseRawRole);
  const byId = new Map(channels.map((c) => [c.id, c]));
  const community = state.community ?? {};
  const blockers = [];
  const notes = [];

  const publicIds = [community.categoryId, community.announcementsId, community.chatId, community.feedbackId];
  if (publicIds.some((id) => !id || !byId.has(id))) {
    blockers.push({ text: 'The SkinVaults 2.0 category or one of its three channels is missing. Run /community setup.', manual: false });
  }
  const allowedIds = new Set(publicIds.filter(Boolean));
  const leaveAlone = new Set([...allowedIds, community.logId, community.ticketsCategoryId, ...Object.values(state.tickets ?? {})].filter(Boolean));

  // Server Guide: Discord keeps the channels it points at visible to everyone, and bots may not edit it.
  let guideIds = [];
  try {
    const guide = await rest.get(`/guilds/${guild.id}/new-member-welcome`);
    // A Server Guide that is switched off does not force anything to stay visible.
    if (guide.enabled) guideIds = (guide.new_member_actions ?? []).map((a) => a.channel_id).filter((id) => !allowedIds.has(id));
  } catch {
    notes.push('Could not read the Server Guide, so that part is not checked.');
  }
  const guideChannels = guideIds.map((id) => byId.get(id)).filter(Boolean);
  if (guideChannels.length) {
    blockers.push({
      text: `The Server Guide points at ${names(guideChannels).join(', ')}, and Discord keeps those visible to everyone. A bot may not change the Server Guide: in Server Settings > Server Guide, replace those actions with the SkinVaults 2.0 channels (or switch the Server Guide off), then run /lockdown retry.`,
      manual: true,
    });
  }

  // Onboarding needs 7 default channels that everyone can see, which cannot hold during a lockdown.
  try {
    const onboarding = await rest.get(Routes.guildOnboarding(guild.id));
    if (onboarding.enabled) {
      blockers.push({ text: 'Onboarding is on. While it is on, members only get its default channels in the sidebar, and it needs 7 channels everyone can see. /lockdown prepare switches it off, /lockdown off puts it back.', manual: false });
    } else if (state.onboarding?.previouslyEnabled) {
      notes.push('Onboarding is off for the lockdown and will be switched back on by /lockdown off.');
    }
  } catch {
    notes.push('Could not read Onboarding, so that part is not checked.');
  }

  // The Community "rules channel" must stay visible to everyone. /lockdown prepare points it at the public announcements channel.
  let rulesId = null;
  try {
    rulesId = (await rest.get(Routes.guild(guild.id))).rules_channel_id ?? null;
  } catch {
    notes.push('Could not read the rules channel setting, so that part is not checked.');
  }
  const rulesChannel = rulesId && !allowedIds.has(rulesId) ? byId.get(rulesId) : null;
  if (rulesChannel) {
    blockers.push({ text: `#${rulesChannel.name} is the server's Community rules channel, so Discord keeps it visible to everyone. /lockdown prepare points the rules channel at #${byId.get(community.announcementsId)?.name ?? 'announcements'} for the lockdown, and /lockdown off puts it back.`, manual: false });
  } else if (state.rulesChannel?.previousId) {
    notes.push('The rules channel is pointed at the SkinVaults 2.0 announcements for the lockdown and will be put back by /lockdown off.');
  }

  const keep = { everyoneId: guild.id, keepRoleIds: cfg.staffRoleIds, keepMemberIds: [...new Set([...cfg.ownerIds, botId])] };
  const active = Boolean(state.lockdown?.active);
  const sim = simulateVisibility({ channels, roles, everyoneId: guild.id, allowedIds, leaveAlone, keep, applyLock: !active });

  const explained = new Set([...guideIds, ...(rulesChannel ? [rulesChannel.id] : [])]);
  const unreachable = [];
  const sees = [];
  const leaks = new Map();
  for (const g of sim.groups) {
    const unexplained = g.sees.filter((c) => !explained.has(c.id));
    if (g.label === '@everyone') sees.push(`Members without any role see: ${g.sees.length ? names(g.sees).join(', ') : 'only the SkinVaults 2.0 channels'}.`);
    for (const c of unexplained) leaks.set(c.id, c);
  }
  for (const c of leaks.values()) {
    const live = guild.channels.cache?.get?.(c.id);
    // Channels discord.js does not know are handled over REST by the lockdown, so only a known, locked-down channel counts.
    if (live && live.manageable === false) unreachable.push(c);
  }
  const fixable = [...leaks.values()].filter((c) => !unreachable.includes(c));
  if (fixable.length) {
    blockers.push({ text: `${active ? 'These are still visible to members' : 'These would stay visible to members even after a lockdown'}: ${names(fixable).slice(0, 12).join(', ')}.${active ? ' /lockdown retry tries them again.' : ''}`, manual: false });
  }
  if (unreachable.length) notes.push(`The bot cannot change ${names(unreachable).join(', ')} (Discord manages it). Members may still see it.`);

  if (sim.adminRoles.length) notes.push(`Roles with Administrator always see everything: ${sim.adminRoles.join(', ')}. Test with "View server as role" > Member, not as yourself.`);
  const otherTickets = channels.filter((c) => c.type === CATEGORY && /ticket/i.test(c.name) && c.id !== community.ticketsCategoryId);
  if (otherTickets.length) {
    const kids = channels.filter((c) => otherTickets.some((t) => t.id === c.parentId)).length;
    notes.push(`The category "${otherTickets.map((c) => c.name).join('", "')}" (${kids} channels) belongs to another ticket system. Its members lose access during the lockdown and get it back on /lockdown off.`);
  }
  notes.push(`Members keep: the SkinVaults 2.0 category with its 3 channels, and their own feedback tickets.`);
  return { ok: blockers.length === 0, blockers, notes, sees };
}

export function renderReport(result) {
  const lines = [result.ok ? 'Ready: nothing is in the way.' : `Not ready yet (${result.blockers.length}):`];
  result.blockers.forEach((b, i) => lines.push(`${i + 1}. ${b.manual ? '[you] ' : '[bot] '}${b.text}`));
  lines.push('', ...result.sees, '', ...result.notes.map((n) => `- ${n}`));
  return lines.join('\n');
}

// ---- Onboarding -------------------------------------------------------------------------------------------------

export async function readOnboardingEnabled(guild) {
  return Boolean((await guild.client.rest.get(Routes.guildOnboarding(guild.id))).enabled);
}

export async function setOnboardingEnabled(guild, enabled, reason) {
  await guild.client.rest.put(Routes.guildOnboarding(guild.id), { body: { enabled }, reason });
}

/** Switch Onboarding off and remember that it was on, so /lockdown off can switch it back. */
export async function pauseOnboarding({ guild, store, log }) {
  const state = store.state();
  const wasOn = await readOnboardingEnabled(guild);
  if (!wasOn) return { changed: false };
  state.onboarding = { previouslyEnabled: true, pausedAt: new Date().toISOString() };
  store.saveState(state);
  await setOnboardingEnabled(guild, false, 'SkinVaults lockdown');
  log('onboarding switched off for the lockdown');
  return { changed: true };
}

/** Called by /lockdown off. Never throws: a failure is reported and the memory stays, so it can be retried. */
export async function resumeOnboarding({ guild, store, log }) {
  const state = store.state();
  if (!state.onboarding?.previouslyEnabled) return null;
  try {
    await setOnboardingEnabled(guild, true, 'SkinVaults lockdown ended');
    delete state.onboarding;
    store.saveState(state);
    log('onboarding switched back on');
    return 'Onboarding is switched back on.';
  } catch (err) {
    log(`onboarding could not be switched back on: ${err.message}`);
    return `Onboarding could not be switched back on (${err.message}). Turn it on in Server Settings > Onboarding.`;
  }
}

// ---- Community rules channel ------------------------------------------------------------------------------------

/** Point the Community rules channel at a public channel and remember the old one for /lockdown off. */
export async function pauseRulesChannel({ guild, store, publicChannelId, log }) {
  const current = (await guild.client.rest.get(Routes.guild(guild.id))).rules_channel_id ?? null;
  if (!current || current === publicChannelId) return { changed: false };
  const state = store.state();
  state.rulesChannel = { previousId: current, pausedAt: new Date().toISOString() };
  store.saveState(state);
  await guild.client.rest.patch(Routes.guild(guild.id), { body: { rules_channel_id: publicChannelId }, reason: 'SkinVaults lockdown' });
  log('rules channel pointed at the public announcements channel for the lockdown');
  return { changed: true };
}

/** Called by /lockdown off. Never throws; the memory stays when it fails so it can be retried. */
export async function resumeRulesChannel({ guild, store, log }) {
  const state = store.state();
  const previousId = state.rulesChannel?.previousId;
  if (!previousId) return null;
  try {
    await guild.client.rest.patch(Routes.guild(guild.id), { body: { rules_channel_id: previousId }, reason: 'SkinVaults lockdown ended' });
    delete state.rulesChannel;
    store.saveState(state);
    log('rules channel put back');
    return 'The rules channel is back where it was.';
  } catch (err) {
    log(`rules channel could not be put back: ${err.message}`);
    return `The rules channel could not be put back (${err.message}). Set it again in Server Settings > Community.`;
  }
}
