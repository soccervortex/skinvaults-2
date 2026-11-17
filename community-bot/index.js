import { Client, Events, GatewayIntentBits } from 'discord.js';
import { giveRole, startSweep } from './lib/autorole.js';
import { commandDefinitions, handleCommand } from './lib/commands.js';
import { loadBotConfig } from './lib/config.js';
import { handleButton, handleModal } from './lib/feedback.js';
import { Store } from './lib/store.js';

const log = (message) => console.log(JSON.stringify({ at: new Date().toISOString(), msg: message }));

let cfg;
try {
  cfg = loadBotConfig(process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const store = new Store(cfg.dataDir);
const intents = [GatewayIntentBits.Guilds];
if (cfg.messageContent) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
if (cfg.memberRoleId) intents.push(GatewayIntentBits.GuildMembers);
const client = new Client({ intents });

client.once(Events.ClientReady, async (c) => {
  const guild = await c.guilds.fetch(cfg.guildId).catch(() => null);
  if (!guild) {
    log(`the bot is not in server ${cfg.guildId}; invite it first`);
    process.exit(1);
  }
  // The server owner always counts as an owner, so lockdown keeps them in and tickets show them.
  if (guild.ownerId && !cfg.ownerIds.includes(guild.ownerId)) cfg.ownerIds.push(guild.ownerId);
  // This bot shares its token with the older SkinVaults bot, so only our own commands are created or updated.
  // Never use commands.set() here: it would delete every command the other bot registered in this server.
  for (const definition of commandDefinitions) await guild.commands.create(definition);
  if (cfg.memberRoleId) startSweep(guild, cfg.memberRoleId, log);
  log(`ready as ${c.user.tag}; commands registered; lockdown active: ${store.state().lockdown?.active ?? false}`);
});

if (cfg.memberRoleId) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id === cfg.guildId && await giveRole(member, cfg.memberRoleId, log, 'SkinVaults member role on join')) log(`member role given to ${member.id} on join`);
  });
  // Members who were in screening get the role as soon as they pass it.
  client.on(Events.GuildMemberUpdate, async (before, member) => {
    if (member.guild.id === cfg.guildId && before.pending && !member.pending) await giveRole(member, cfg.memberRoleId, log, 'SkinVaults member role after screening');
  });
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guildId !== cfg.guildId) return;
  const ctx = { cfg, store, botId: client.user.id, log };
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction, ctx);
    else if (interaction.isButton() && interaction.customId.startsWith('sv2:fb:')) await handleButton(interaction, ctx);
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('sv2:fb:')) await handleModal(interaction, ctx);
  } catch (err) {
    log(`interaction failed: ${err.message}`);
    const body = { content: 'Something went wrong. Please try again in a moment.', flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(body).catch(() => {});
    else await interaction.reply(body).catch(() => {});
  }
});

process.on('unhandledRejection', (err) => log(`unhandled rejection: ${err?.message ?? err}`));
await client.login(cfg.token);
