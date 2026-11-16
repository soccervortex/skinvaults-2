// Feedback panel: four buttons, a short form, and a private ticket channel per submission.
// Every submission is also appended to feedback.jsonl so nothing is lost if a ticket channel is deleted.

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder, OverwriteType, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { ATTACH_FILES, EMBED_LINKS, READ_MESSAGE_HISTORY, SEND_MESSAGES, VIEW_CHANNEL } from './permissions.js';

export const TYPES = {
  suggest: { label: 'Suggest an idea', emoji: '💡', style: ButtonStyle.Primary, whyLabel: 'Why would this help you?' },
  add: { label: 'Add a feature', emoji: '➕', style: ButtonStyle.Success, whyLabel: 'How would you use it?' },
  remove: { label: 'Remove a feature', emoji: '➖', style: ButtonStyle.Danger, whyLabel: 'What is wrong with it?' },
  other: { label: 'Something else', emoji: '💬', style: ButtonStyle.Secondary, whyLabel: 'Anything else we should know?' },
};

const PREFIX = 'sv2:fb';
const COOLDOWN_MS = 30_000;
const lastOpen = new Map();

export function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Help us build SkinVaults 2.0')
    .setDescription([
      'We are rebuilding SkinVaults from scratch: smaller, faster and with fewer bugs. You decide what goes in.',
      '',
      '**How it works**',
      '1. Press the button that fits what you want to tell us.',
      '2. Fill in the short form (about one minute).',
      '3. A **private channel** opens that only you and the team can see. We reply there.',
      '',
      '**What to send**',
      '💡 **Suggest an idea**: anything that would make the site better.',
      '➕ **Add a feature**: something the old site did not have, or lost.',
      '➖ **Remove a feature**: something you never used, or that got in the way.',
      '💬 **Something else**: bugs, questions, or anything that does not fit above.',
      '',
      'One open ticket per person. Please do not share passwords, Steam login details or trade links.',
    ].join('\n'))
    .setFooter({ text: 'Only you and the SkinVaults team can see your ticket.' });
  const row = new ActionRowBuilder().addComponents(
    ...Object.entries(TYPES).map(([key, t]) => new ButtonBuilder().setCustomId(`${PREFIX}:new:${key}`).setLabel(t.label).setEmoji(t.emoji).setStyle(t.style)),
  );
  return { embeds: [embed], components: [row] };
}

/** Posts the panel, or edits the existing one so there is only ever a single panel. */
export async function postPanel(channel, store) {
  const state = store.state();
  const payload = buildPanel();
  if (state.community.panelMessageId) {
    try {
      const old = await channel.messages.fetch(state.community.panelMessageId);
      await old.edit(payload);
      return old;
    } catch { /* message was deleted: post a new one */ }
  }
  const msg = await channel.send(payload);
  state.community.panelMessageId = msg.id;
  store.saveState(state);
  return msg;
}

export function buildModal(type) {
  const t = TYPES[type];
  const input = (id, label, style, min, max, required, placeholder) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMinLength(min).setMaxLength(max).setRequired(required).setPlaceholder(placeholder),
  );
  return new ModalBuilder().setCustomId(`${PREFIX}:modal:${type}`).setTitle(t.label).addComponents(
    input('title', 'Short title', TextInputStyle.Short, 5, 100, true, 'One line that sums it up'),
    input('details', 'Tell us more', TextInputStyle.Paragraph, 20, 1500, true, 'What do you have in mind?'),
    input('why', t.whyLabel, TextInputStyle.Paragraph, 0, 600, false, 'Optional'),
  );
}

export function ticketChannelName(type, username, number) {
  const clean = username.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'user';
  return `${type}-${clean}-${String(number).padStart(3, '0')}`;
}

async function openTicketOf(guild, state, userId) {
  const id = state.tickets[userId];
  if (!id) return null;
  try {
    return await guild.channels.fetch(id);
  } catch {
    delete state.tickets[userId];
    return null;
  }
}

export async function handleButton(interaction, { cfg, store }) {
  const id = interaction.customId;
  if (id === `${PREFIX}:close`) return closeTicket(interaction, { cfg, store });
  const type = id.split(':')[3];
  if (!TYPES[type]) return interaction.reply({ content: 'That button is no longer valid.', flags: MessageFlags.Ephemeral });

  const state = store.state();
  const open = await openTicketOf(interaction.guild, state, interaction.user.id);
  store.saveState(state);
  if (open) return interaction.reply({ content: `You already have an open ticket: ${open}. Please continue there, or close it first.`, flags: MessageFlags.Ephemeral });

  const last = lastOpen.get(interaction.user.id) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) return interaction.reply({ content: 'Please wait a few seconds before trying again.', flags: MessageFlags.Ephemeral });
  lastOpen.set(interaction.user.id, Date.now());
  return interaction.showModal(buildModal(type));
}

export async function handleModal(interaction, { cfg, store, botId }) {
  const type = interaction.customId.split(':')[3];
  if (!TYPES[type]) return interaction.reply({ content: 'That form is no longer valid.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const state = store.state();
  if (await openTicketOf(interaction.guild, state, interaction.user.id)) {
    return interaction.editReply('You already have an open ticket, so no second one was created.');
  }
  const title = interaction.fields.getTextInputValue('title').trim();
  const details = interaction.fields.getTextInputValue('details').trim();
  const why = interaction.fields.getTextInputValue('why').trim();

  state.counter += 1;
  const number = state.counter;
  const role = (id) => ({ id, type: OverwriteType.Role, allow: VIEW_CHANNEL | READ_MESSAGE_HISTORY | SEND_MESSAGES | ATTACH_FILES | EMBED_LINKS, deny: 0n });
  const member = (id) => ({ id, type: OverwriteType.Member, allow: VIEW_CHANNEL | READ_MESSAGE_HISTORY | SEND_MESSAGES | ATTACH_FILES | EMBED_LINKS, deny: 0n });
  const channel = await interaction.guild.channels.create({
    name: ticketChannelName(type, interaction.user.username, number),
    type: ChannelType.GuildText,
    parent: state.community.ticketsCategoryId,
    topic: `${TYPES[type].label} from ${interaction.user.tag ?? interaction.user.username} (${interaction.user.id})`,
    permissionOverwrites: [
      { id: interaction.guild.id, type: OverwriteType.Role, allow: 0n, deny: VIEW_CHANNEL },
      member(interaction.user.id),
      member(botId),
      ...cfg.ownerIds.map(member),
      ...cfg.staffRoleIds.map(role),
    ],
  });
  state.tickets[interaction.user.id] = channel.id;
  store.saveState(state);
  store.append('feedback.jsonl', {
    at: new Date().toISOString(), number, type, userId: interaction.user.id, user: interaction.user.username, title, details, why, channelId: channel.id,
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${TYPES[type].emoji} ${title}`.slice(0, 256))
    .setDescription(details)
    .setAuthor({ name: interaction.user.username })
    .setFooter({ text: `${TYPES[type].label} · ticket #${number}` });
  if (why) embed.addFields({ name: TYPES[type].whyLabel, value: why });
  const close = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${PREFIX}:close`).setLabel('Close ticket').setStyle(ButtonStyle.Secondary));
  await channel.send({
    content: `${interaction.user}, thank you! The team will reply here. ${cfg.staffRoleIds.map((r) => `<@&${r}>`).join(' ')}`.trim(),
    embeds: [embed],
    components: [close],
    allowedMentions: { users: [interaction.user.id], roles: cfg.staffRoleIds },
  });
  return interaction.editReply(`Your ticket is open: ${channel}`);
}

async function closeTicket(interaction, { cfg, store }) {
  const state = store.state();
  const owner = Object.entries(state.tickets).find(([, channelId]) => channelId === interaction.channelId)?.[0];
  if (!owner) return interaction.reply({ content: 'This is not an open feedback ticket.', flags: MessageFlags.Ephemeral });
  const isTeam = cfg.ownerIds.includes(interaction.user.id) || cfg.staffRoleIds.some((r) => interaction.member.roles.cache.has(r));
  if (interaction.user.id !== owner && !isTeam) return interaction.reply({ content: 'Only the person who opened this ticket or the team can close it.', flags: MessageFlags.Ephemeral });

  await interaction.reply({ content: 'Closing this ticket...', flags: MessageFlags.Ephemeral });
  const log = state.community.logId ? await interaction.guild.channels.fetch(state.community.logId).catch(() => null) : null;
  if (log) {
    const lines = [`Ticket ${interaction.channel.name} closed by ${interaction.user.username}.`];
    if (cfg.messageContent) {
      const messages = [...(await interaction.channel.messages.fetch({ limit: 100 })).values()].reverse();
      const text = messages.map((m) => `[${m.createdAt.toISOString()}] ${m.author.username}: ${m.content}`).join('\n');
      await log.send({ content: lines[0], files: [{ attachment: Buffer.from(text || '(empty)', 'utf8'), name: `${interaction.channel.name}.txt` }] });
    } else {
      await log.send(`${lines[0]} The submission itself is saved in feedback.jsonl. Message text is not archived because the Message Content intent is off.`);
    }
  }
  delete state.tickets[owner];
  store.saveState(state);
  await interaction.channel.delete(`Closed by ${interaction.user.username}`);
}
