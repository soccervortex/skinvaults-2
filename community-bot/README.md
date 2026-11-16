# SkinVaults community bot

A small Discord bot (discord.js 14) for the SkinVaults server. It does two things:

1. **Lockdown.** `/lockdown on` saves the permission setup of every channel, then hides the whole server except the
   "SkinVaults 2.0" category. `/lockdown off` puts every channel back exactly as it was and checks the result.
2. **Feedback tickets.** The `#feedback` channel is read-only and holds one embed with four buttons
   (suggest an idea, add a feature, remove a feature, something else). A button opens a short form, and the form opens a
   private channel that only the member and the team can see.

It runs in **one** server (`DISCORD_GUILD_ID`) and only owners (`OWNER_IDS`) can use the commands.
It does not read the old bot's database and does not share a token with it.

## Setup

1. Discord developer portal: create a new application and bot. Copy the token (never paste it into chat or a file in git).
   Invite it with the scopes `bot` and `applications.commands`. Give it these permissions: Manage Channels, Manage Roles,
   View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Mention Everyone (only if you want `@everyone` pings).
2. Move the bot's role **above** the roles it has to manage, in Server Settings > Roles. Without this it cannot edit those channels.
3. Set the variables from `.env.example`.
4. `npm install`, then `node index.js`. On start the bot registers its two commands in that one server only.

## Using it

| Command | What it does |
|---|---|
| `/community setup` | Creates the category, `announcements`, `chat`, `feedback`, a staff-only `feedback-log` and a hidden ticket category. Posts the feedback panel. Safe to run again. |
| `/lockdown preview` | Lists what would change. Changes nothing. Warns about roles with Administrator (they still see everything) and the rules channel (Discord may insist it stays visible). |
| `/lockdown on confirm:true ping:...` | Saves a snapshot to `DATA_DIR/snapshots/`, reads it back, then locks. Posts a notice in `#feedback`. `ping` is `nobody` (default), `@here` or `@everyone`. |
| `/lockdown off ping:...` | Restores every channel from the snapshot, re-reads each one from Discord and compares. Posts "server is open again" in `#announcements`. |
| `/lockdown status` | Shows whether the server is locked and any channels that failed. |

Safety rules built in:
- The snapshot is written to disk and read back **before** the first change. If that fails, nothing changes.
- `/lockdown on` is refused while a lockdown is active, so a snapshot is never taken from an already locked server.
- If the bot cannot edit even one channel, nothing is changed and the channel names are listed.
- If a restore does not match the snapshot, the lockdown stays marked active and the mismatching channels are listed. Run `/lockdown off` again.
- Channels created during lockdown are left alone. Channels deleted during lockdown are reported, not recreated.
- Staff roles, the owners and the bot keep seeing everything while locked.

## Data

`DATA_DIR` (default `./data`, on Nebula `/data`) holds `state.json`, `snapshots/*.json` and `feedback.jsonl` (every submission).
Back it up. Keep it out of git (it contains Discord ids and what members typed).

## Tests

`npm test` runs the permission maths and a full lock/restore cycle against a fake server, including partial failures.
**Not tested against real Discord yet**: the slash commands, the buttons and the form, and permission edge cases such as the rules channel.
Try `/lockdown preview` and a lockdown on a spare test server first.
