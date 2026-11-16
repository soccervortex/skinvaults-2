// The public part of the server during a lockdown: one category with announcements, chat and a feedback channel,
// plus two staff-only places (feedback log and the category the private tickets live in).
// Setup is idempotent: run it twice and nothing is duplicated.

import { ChannelType, OverwriteType } from 'discord.js';
import {
  ADD_REACTIONS, ATTACH_FILES, CREATE_PRIVATE_THREADS, CREATE_PUBLIC_THREADS, EMBED_LINKS, READ_MESSAGE_HISTORY,
  SEND_MESSAGES, SEND_MESSAGES_IN_THREADS, VIEW_CHANNEL,
} from './permissions.js';

const READ_ONLY_DENY = SEND_MESSAGES | SEND_MESSAGES_IN_THREADS | CREATE_PUBLIC_THREADS | CREATE_PRIVATE_THREADS;
const BOT_ALLOW = VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_MESSAGE_HISTORY | ATTACH_FILES;

export const NAMES = {
  category: 'SkinVaults 2.0',
  announcements: 'announcements',
  chat: 'chat',
  feedback: 'feedback',
  log: 'feedback-log',
  tickets: 'SkinVaults 2.0 tickets',
};

/** Overwrites for one of our channels. kind: 'readonly' | 'chat' | 'private' */
export function overwritesFor(kind, guild, cfg, botId) {
  const role = (id, allow, deny = 0n) => ({ id, type: OverwriteType.Role, allow, deny });
  const member = (id, allow) => ({ id, type: OverwriteType.Member, allow, deny: 0n });
  const list = [];
  if (kind === 'readonly') list.push(role(guild.id, VIEW_CHANNEL | READ_MESSAGE_HISTORY | ADD_REACTIONS, READ_ONLY_DENY));
  else if (kind === 'chat') list.push(role(guild.id, VIEW_CHANNEL | READ_MESSAGE_HISTORY | SEND_MESSAGES | ADD_REACTIONS));
  else list.push(role(guild.id, 0n, VIEW_CHANNEL));

  for (const id of cfg.staffRoleIds) list.push(role(id, VIEW_CHANNEL | READ_MESSAGE_HISTORY | SEND_MESSAGES | ATTACH_FILES | EMBED_LINKS));
  for (const id of new Set([...cfg.ownerIds, botId])) list.push(member(id, id === botId ? BOT_ALLOW : VIEW_CHANNEL | READ_MESSAGE_HISTORY | SEND_MESSAGES));
  return list;
}

async function existing(guild, id) {
  if (!id) return null;
  try {
    return await guild.channels.fetch(id);
  } catch {
    return null;
  }
}

/** Creates whatever is missing and returns the channels. Saves ids in state so lockdown knows to leave them alone. */
export async function setupCommunity({ guild, cfg, store, botId }) {
  const state = store.state();
  const c = (state.community ??= {});
  const created = [];

  const ensure = async (key, options) => {
    let channel = await existing(guild, c[key]);
    if (!channel) {
      channel = await guild.channels.create(options);
      created.push(channel.name);
    }
    c[key] = channel.id;
    store.saveState(state);
    return channel;
  };

  const category = await ensure('categoryId', {
    name: NAMES.category, type: ChannelType.GuildCategory, permissionOverwrites: overwritesFor('readonly', guild, cfg, botId),
  });
  const child = (key, name, kind, extra = {}) => ensure(key, {
    name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwritesFor(kind, guild, cfg, botId), ...extra,
  });
  const announcements = await child('announcementsId', NAMES.announcements, 'readonly', { topic: 'News about the SkinVaults rebuild.' });
  const chat = await child('chatId', NAMES.chat, 'chat', { topic: 'Talk about SkinVaults 2.0 here. Be kind.', rateLimitPerUser: 5 });
  const feedback = await child('feedbackId', NAMES.feedback, 'readonly', { topic: 'Press a button to send us a private suggestion or request.' });
  const log = await ensure('logId', {
    name: NAMES.log, type: ChannelType.GuildText, permissionOverwrites: overwritesFor('private', guild, cfg, botId), topic: 'Staff only: closed feedback tickets.',
  });
  const tickets = await ensure('ticketsCategoryId', {
    name: NAMES.tickets, type: ChannelType.GuildCategory, permissionOverwrites: overwritesFor('private', guild, cfg, botId),
  });
  return { created, category, announcements, chat, feedback, log, tickets };
}

/** Posts a notice with an optional mass ping. ping: 'none' | 'here' | 'everyone'. */
export async function postNotice(channel, { title, text, ping }) {
  const prefix = ping === 'everyone' ? '@everyone ' : ping === 'here' ? '@here ' : '';
  return channel.send({
    content: prefix.trim() || undefined,
    embeds: [{ title, description: text, color: 0x5865f2 }],
    allowedMentions: { parse: ping === 'none' ? [] : ['everyone'] },
  });
}
