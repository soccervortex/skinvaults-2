// Gives every human member the member role: right when they join, and again every few minutes for anyone who was
// missed (for example people who joined while the bot was offline). Bots and members still in membership screening
// are skipped; screening members are picked up when they pass it or by the next sweep.

export const SWEEP_EVERY_MS = 5 * 60 * 1000;

export function needsRole(member, roleId) {
  return !member.user?.bot && !member.pending && !member.roles.cache.has(roleId);
}

/** Adds the role if the member needs it. Returns true when the role was added. Never throws. */
export async function giveRole(member, roleId, log, reason = 'SkinVaults member role') {
  if (!needsRole(member, roleId)) return false;
  try {
    await member.roles.add(roleId, reason);
    return true;
  } catch (err) {
    log(`member role not given to ${member.id}: ${err.message}`);
    return false;
  }
}

/** Checks every member of the server. Returns how many were checked and how many got the role. */
export async function sweepMembers(guild, roleId, log) {
  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    log(`member role ${roleId} does not exist in this server`);
    return { checked: 0, added: 0, problem: 'role missing' };
  }
  if (!role.editable) {
    log(`member role "${role.name}" is above the bot's own role, so it cannot be given. Move the bot's role higher.`);
    return { checked: 0, added: 0, problem: 'role above bot' };
  }
  const members = await guild.members.fetch();
  let added = 0;
  for (const member of members.values()) if (await giveRole(member, roleId, log, 'SkinVaults member role sweep')) added += 1;
  if (added > 0) log(`member role sweep: ${added} member(s) were missing the role and got it`);
  return { checked: members.size, added };
}

/** Starts the five minute sweep. Runs once now, never overlaps itself, and keeps going after an error. */
export function startSweep(guild, roleId, log, every = SWEEP_EVERY_MS) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sweepMembers(guild, roleId, log);
    } catch (err) {
      log(`member role sweep failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  run();
  return setInterval(run, every);
}
