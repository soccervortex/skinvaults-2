// Slash commands. Both are owner-only (OWNER_IDS), and the bot only answers inside the configured server.

import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { postNotice, setupCommunity } from './community.js';
import { postPanel } from './feedback.js';
import { disableLockdown, enableLockdown, managedChannelIds, planLockdown } from './lockdown.js';

const EPH = MessageFlags.Ephemeral;
const pingOption = (o) => o.setName('ping').setDescription('Tag people in the announcement (default: nobody)')
  .addChoices({ name: 'nobody', value: 'none' }, { name: '@here (online members)', value: 'here' }, { name: '@everyone', value: 'everyone' });

export const commandDefinitions = [
  new SlashCommandBuilder().setName('lockdown').setDescription('Hide the whole server except the SkinVaults 2.0 category, and bring it back later')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('preview').setDescription('Show what would change. Changes nothing.'))
    .addSubcommand((s) => s.setName('on').setDescription('Save the current setup, then lock the server')
      .addBooleanOption((o) => o.setName('confirm').setDescription('Set to true to really lock the server').setRequired(true))
      .addStringOption(pingOption))
    .addSubcommand((s) => s.setName('off').setDescription('Restore the saved setup exactly as it was').addStringOption(pingOption))
    .addSubcommand((s) => s.setName('status').setDescription('Show whether the server is locked')),
  new SlashCommandBuilder().setName('community').setDescription('SkinVaults 2.0 community channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('setup').setDescription('Create the category, channels and the feedback panel (safe to run again)'))
    .addSubcommand((s) => s.setName('panel').setDescription('Re-post or refresh the feedback panel')),
].map((c) => c.toJSON());

const cut = (text) => (text.length > 1900 ? `${text.slice(0, 1890)}\n...` : text);
const failureLines = (list) => list.slice(0, 8).map((f) => `- ${f.name}: ${f.error}`).join('\n');

export async function handleCommand(interaction, { cfg, store, botId, log }) {
  if (!cfg.ownerIds.includes(interaction.user.id)) return interaction.reply({ content: 'Only the SkinVaults owners can use this.', flags: EPH });
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: EPH });
  const guild = interaction.guild;

  try {
    if (interaction.commandName === 'community') {
      const made = await setupCommunity({ guild, cfg, store, botId });
      if (sub === 'setup' || sub === 'panel') await postPanel(made.feedback, store);
      return interaction.editReply(sub === 'setup'
        ? `Community channels are ready: ${made.announcements}, ${made.chat}, ${made.feedback}. Created now: ${made.created.join(', ') || 'nothing new'}.`
        : `Feedback panel refreshed in ${made.feedback}.`);
    }

    const state = store.state();
    if (sub === 'status') {
      const l = state.lockdown ?? {};
      return interaction.editReply(l.active
        ? `Lockdown is ON (${l.phase}) since ${l.startedAt}. Snapshot: ${l.snapshotFile}.${l.failures?.length ? `\nProblem channels:\n${failureLines(l.failures)}` : ''}`
        : `Lockdown is off.${l.lastRestoredAt ? ` Last restored ${l.lastRestoredAt}.` : ''}`);
    }

    if (sub === 'preview') {
      if (!state.community.feedbackId) return interaction.editReply('Run /community setup first, so the public channels exist before anything is hidden.');
      const plan = await planLockdown(guild, cfg, state, botId);
      const lines = [
        `Would hide ${plan.items.filter((i) => i.changed).length} of ${plan.items.length} channels (${managedChannelIds(state).size} community channels stay as they are).`,
        plan.blocked.length ? `The bot cannot edit: ${plan.blocked.join(', ')}. Fix that first.` : 'The bot can edit every channel.',
        ...plan.warnings,
        'Nothing was changed.',
      ];
      return interaction.editReply(cut(lines.join('\n')));
    }

    const ping = interaction.options.getString('ping') ?? 'none';
    if (sub === 'on') {
      if (!interaction.options.getBoolean('confirm')) return interaction.editReply('Not confirmed, nothing changed.');
      if (!state.community.feedbackId) return interaction.editReply('Run /community setup first, so the public channels exist before anything is hidden.');
      const result = await enableLockdown({ guild, cfg, store, botId, startedBy: interaction.user.id, log });
      const feedback = await guild.channels.fetch(state.community.feedbackId);
      await postNotice(feedback, {
        title: 'SkinVaults is being rebuilt',
        text: 'The server is in **lockdown** while we build SkinVaults 2.0. Only this category is visible for now.\n\nTell us what you want to see, change or lose: press a button below and a private ticket opens.',
        ping,
      });
      return interaction.editReply(cut([
        `Locked ${result.changed} of ${result.total} channels. The old setup is saved in ${result.snapshotFile}.`,
        result.failures.length ? `Failed:\n${failureLines(result.failures)}\nRun /lockdown off to restore everything, or fix these and run /lockdown status.` : 'No errors.',
        ...result.warnings,
      ].join('\n')));
    }

    if (sub === 'off') {
      const result = await disableLockdown({ guild, store, log });
      if (result.failures.length === 0 && state.community.announcementsId) {
        const announcements = await guild.channels.fetch(state.community.announcementsId);
        await postNotice(announcements, { title: 'The server is open again', text: 'Lockdown is over and all channels are back. Thanks for your patience!', ping });
      }
      return interaction.editReply(cut([
        `Restored ${result.restored} of ${result.total} channels from ${result.snapshotFile}.`,
        result.missing.length ? `Deleted since the snapshot (not recreated): ${result.missing.join(', ')}.` : '',
        result.failures.length ? `Still wrong:\n${failureLines(result.failures)}\nRun /lockdown off again after fixing.` : 'Everything matches the saved setup.',
      ].filter(Boolean).join('\n')));
    }
  } catch (err) {
    log(`command ${interaction.commandName} ${sub} failed: ${err.message}`);
    return interaction.editReply(cut(`That did not work: ${err.message}`));
  }
}
