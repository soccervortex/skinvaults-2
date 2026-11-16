import { Client, Events, GatewayIntentBits } from 'discord.js';
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
const client = new Client({ intents });

client.once(Events.ClientReady, async (c) => {
  const guild = await c.guilds.fetch(cfg.guildId).catch(() => null);
  if (!guild) {
    log(`the bot is not in server ${cfg.guildId}; invite it first`);
    process.exit(1);
  }
  // Server-scoped commands only: this never touches global commands or other servers.
  await guild.commands.set(commandDefinitions);
  log(`ready as ${c.user.tag}; commands registered; lockdown active: ${store.state().lockdown?.active ?? false}`);
});

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
