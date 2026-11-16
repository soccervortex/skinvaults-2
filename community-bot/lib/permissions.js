// Pure permission maths for lockdown and restore. No Discord objects in here, so it can be tested without a server.
// Bitfields are BigInt in memory and decimal strings on disk (JSON cannot hold a BigInt).

export const VIEW_CHANNEL = 1n << 10n;
export const SEND_MESSAGES = 1n << 11n;
export const READ_MESSAGE_HISTORY = 1n << 16n;
export const ATTACH_FILES = 1n << 15n;
export const EMBED_LINKS = 1n << 14n;
export const ADD_REACTIONS = 1n << 6n;
export const USE_EXTERNAL_EMOJIS = 1n << 18n;
export const MANAGE_CHANNELS = 1n << 4n;
export const MANAGE_ROLES = 1n << 28n;
export const SEND_MESSAGES_IN_THREADS = 1n << 38n;
export const CREATE_PUBLIC_THREADS = 1n << 35n;
export const CREATE_PRIVATE_THREADS = 1n << 36n;

export const ROLE = 0;
export const MEMBER = 1;

/** @typedef {{ id: string, type: number, allow: bigint, deny: bigint }} Overwrite */

export function serializeOverwrites(list) {
  return list.map((o) => ({ id: o.id, type: o.type, allow: o.allow.toString(), deny: o.deny.toString() }));
}

export function parseOverwrites(list) {
  return list.map((o) => ({ id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }));
}

/**
 * Overwrites for one channel while the server is locked.
 * - everyone loses View Channel (this alone hides the channel from every role that has View Channel only through role permissions)
 * - any other role or member that was explicitly allowed to view loses that, unless it is on the keep list
 * - keep-listed roles and members get an explicit allow, because the everyone-deny would otherwise hide the channel from them too
 *
 * @param {Overwrite[]} current
 * @param {{ everyoneId: string, keepRoleIds: string[], keepMemberIds: string[] }} who
 * @returns {Overwrite[]}
 */
export function lockedOverwrites(current, who) {
  const keepRoles = new Set(who.keepRoleIds);
  const keepMembers = new Set(who.keepMemberIds);
  const out = current.map((o) => ({ ...o }));

  const find = (id, type) => out.find((o) => o.id === id && o.type === type);
  const ensure = (id, type) => {
    let o = find(id, type);
    if (!o) {
      o = { id, type, allow: 0n, deny: 0n };
      out.push(o);
    }
    return o;
  };

  for (const o of out) {
    const kept = (o.type === ROLE && keepRoles.has(o.id)) || (o.type === MEMBER && keepMembers.has(o.id));
    if (o.id === who.everyoneId || kept) continue;
    if (o.allow & VIEW_CHANNEL) {
      o.allow &= ~VIEW_CHANNEL;
      o.deny |= VIEW_CHANNEL;
    }
  }

  const everyone = ensure(who.everyoneId, ROLE);
  everyone.allow &= ~VIEW_CHANNEL;
  everyone.deny |= VIEW_CHANNEL;

  for (const id of keepRoles) allowView(ensure(id, ROLE));
  for (const id of keepMembers) allowView(ensure(id, MEMBER));
  return out;
}

function allowView(o) {
  o.deny &= ~VIEW_CHANNEL;
  o.allow |= VIEW_CHANNEL;
}

const sortKey = (o) => `${o.type}:${o.id}`;

/** Compare two overwrite lists ignoring order. Returns a list of human readable differences (empty means identical). */
export function diffOverwrites(expected, actual) {
  const a = new Map(expected.map((o) => [sortKey(o), o]));
  const b = new Map(actual.map((o) => [sortKey(o), o]));
  const problems = [];
  for (const [key, o] of a) {
    const live = b.get(key);
    if (!live) problems.push(`missing overwrite ${key}`);
    else if (live.allow !== o.allow || live.deny !== o.deny) problems.push(`overwrite ${key} differs`);
  }
  for (const key of b.keys()) if (!a.has(key)) problems.push(`unexpected overwrite ${key}`);
  return problems;
}
