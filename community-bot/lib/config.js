// Reads and validates environment variables. Refuses to start with a message that names every problem at once.

const SNOWFLAKE = /^\d{15,25}$/;

function list(value) {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadBotConfig(env) {
  const problems = [];
  const need = (name) => {
    const v = (env[name] ?? '').trim();
    if (!v) problems.push(`${name} is missing`);
    return v;
  };
  const ids = (name, required) => {
    const values = required ? list(need(name)) : list(env[name]);
    for (const v of values) if (!SNOWFLAKE.test(v)) problems.push(`${name} contains "${v.slice(0, 6)}...", which is not a Discord id`);
    return values;
  };

  const token = need('DISCORD_BOT_TOKEN');
  const guildId = ids('DISCORD_GUILD_ID', true)[0] ?? '';
  // Optional: the server owner is always allowed, OWNER_IDS adds more people.
  const ownerIds = ids('OWNER_IDS', false);
  const staffRoleIds = ids('STAFF_ROLE_IDS', false);

  if (problems.length > 0) throw new Error(`Bot configuration is not valid:\n - ${problems.join('\n - ')}`);

  return {
    token,
    guildId,
    ownerIds,
    staffRoleIds,
    // Reading message text needs the privileged Message Content intent, which must be switched on in the developer portal first.
    messageContent: env.ENABLE_MESSAGE_CONTENT === '1',
    dataDir: (env.DATA_DIR ?? './data').trim() || './data',
  };
}
