import assert from 'node:assert/strict';
import test from 'node:test';
import { commandDefinitions } from '../lib/commands.js';
import { NAMES, overwritesFor } from '../lib/community.js';
import { TYPES, buildModal, buildPanel, ticketChannelName } from '../lib/feedback.js';
import { VIEW_CHANNEL, SEND_MESSAGES } from '../lib/permissions.js';

test('the panel has one button per request type and valid ids', () => {
  const panel = buildPanel();
  const buttons = panel.components[0].toJSON().components;
  assert.equal(buttons.length, Object.keys(TYPES).length);
  for (const b of buttons) assert.match(b.custom_id, /^sv2:fb:new:(suggest|add|remove|other)$/);
  assert.ok(panel.embeds[0].toJSON().description.length < 4000);
});

test('every form builds within Discord limits', () => {
  for (const type of Object.keys(TYPES)) {
    const modal = buildModal(type).toJSON();
    assert.equal(modal.components.length, 3);
    assert.ok(modal.title.length <= 45);
  }
});

test('ticket channel names are safe and short', () => {
  assert.equal(ticketChannelName('add', 'Jan_de Vries!!', 7), 'add-jan-de-vries-007');
  assert.match(ticketChannelName('other', '###', 1), /^other-user-001$/);
  assert.ok(ticketChannelName('suggest', 'x'.repeat(80), 1).length <= 100);
});

test('slash command definitions are valid JSON and owner-gated by default permissions', () => {
  assert.deepEqual(commandDefinitions.map((c) => c.name), ['lockdown', 'community']);
  for (const c of commandDefinitions) assert.ok(c.default_member_permissions);
});

test('read-only channels let everyone read but not write; private channels hide from everyone', () => {
  const guild = { id: '100000000000000001' };
  const cfg = { ownerIds: ['100000000000000003'], staffRoleIds: ['100000000000000004'] };
  const bot = '100000000000000002';
  const everyone = (kind) => overwritesFor(kind, guild, cfg, bot).find((o) => o.id === guild.id);
  assert.ok(everyone('readonly').allow & VIEW_CHANNEL);
  assert.ok(everyone('readonly').deny & SEND_MESSAGES);
  assert.ok(everyone('chat').allow & SEND_MESSAGES);
  assert.ok(everyone('private').deny & VIEW_CHANNEL);
  assert.equal(NAMES.category, 'SkinVaults 2.0');
});
