# SkinVaults community bot

A small Discord bot (discord.js 14) for the SkinVaults server. It does two things:

1. **Lockdown.** `/lockdown on` saves the permission setup of every channel, then hides the whole server except the
   "SkinVaults 2.0" category. `/lockdown off` puts every channel back exactly as it was and checks the result.
2. **Feedback tickets.** The `#feedback` channel is read-only and holds one embed with four buttons
   (suggest an idea, add a feature, remove a feature, something else). A button opens a short form, and the form opens a
   private channel that only the member and the team can see.

It runs in **one** server (`DISCORD_GUILD_ID`) and only owners can use the commands: the server owner, plus anyone in the optional `OWNER_IDS`.
It does not read the old bot's database. It runs on the token of the existing SkinVaults bot and only creates or updates its own two commands; it never removes the old bot's commands.

## Setup

1. Use the existing SkinVaults bot application (token stays in the Nebula environment, never in chat or git).
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
| `/lockdown check` | Read-only. Lists what is in the way (Server Guide, Onboarding, channels that would stay visible), marks each as `[bot]` (the bot can fix it) or `[you]` (only a person can), and shows what members without any role would see. |
| `/lockdown prepare` | Does what the bot may do: creates missing community channels and switches Onboarding off and points the Community rules channel at `#announcements` (it remembers both, `/lockdown off` puts them back). Then runs the check. |
| `/lockdown on confirm:true ping:... force:...` | Runs the check first and refuses if something is in the way (`force:true` overrides). Saves a snapshot to `DATA_DIR/snapshots/`, reads it back, then locks. Posts a notice in `#feedback`. `ping` is `nobody` (default), `@here` or `@everyone`. |
| `/lockdown retry` | While locked: locks the channels that are still open, for example after the Server Guide was changed. The snapshot is not rewritten. |
| `/lockdown off ping:...` | Restores every channel from the snapshot, re-reads each one from Discord and compares. Posts "server is open again" in `#announcements`. Switches Onboarding back on if `/lockdown prepare` had switched it off. |
| `/lockdown status` | Shows whether the server is locked and any channels that failed. |

Things a bot cannot do (Discord refuses, 403): change the **Server Guide**. Channels the Server Guide points at (for example welcome, announcements, faq) stay visible to everyone until a person replaces those actions in Server Settings > Server Guide. Members with Administrator (Owner, Admin, bots) always see everything, so test with "View server as role" > Member.

Safety rules built in:
- The snapshot is written to disk and read back **before** the first change. If that fails, nothing changes.
- `/lockdown on` is refused while a lockdown is active, so a snapshot is never taken from an already locked server.
- If the bot cannot edit even one channel, nothing is changed and the channel names are listed.
- If a restore does not match the snapshot, the lockdown stays marked active and the mismatching channels are listed. Run `/lockdown off` again.
- Channels created during lockdown are left alone. Channels deleted during lockdown are reported, not recreated.
- Staff roles, the owners and the bot keep seeing everything while locked.

## Member role

Set `MEMBER_ROLE_ID` and the bot gives that role to every human member: immediately when they join (or when they pass membership screening), once at startup for anyone who joined while the bot was offline, and again every 5 minutes for anyone still missing it. Bots are skipped. The bot needs the **Server Members** intent (Developer Portal > Bot > Privileged Gateway Intents) and its own role must sit above the member role; if not, the log says so. Leave `MEMBER_ROLE_ID` empty to switch the feature off.

## Data

`DATA_DIR` (default `./data`, on Nebula `/data`) holds `state.json`, `snapshots/*.json` and `feedback.jsonl` (every submission).
Back it up. Keep it out of git (it contains Discord ids and what members typed).

## Tests

`npm test` runs the permission maths and a full lock/restore cycle against a fake server, including partial failures.
**Not tested against real Discord yet**: the slash commands, the buttons and the form, and permission edge cases such as the rules channel.
Try `/lockdown preview` and a lockdown on a spare test server first.
