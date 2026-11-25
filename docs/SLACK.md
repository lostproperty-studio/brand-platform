# Requests and chats in Slack

Client requests and conversations with Lost Property arrive in one Slack channel, one thread each. Anyone in the
studio replies in the thread and the client sees it in their portal; a ✅ on the first message marks it done.

- **Requests form (Portal 1, Settings → Requests):** every request posts to the channel.
- **Ask → Lost Property (both portals):** chats, tickets and session requests, once the client can see
  *Working with Lost Property* (Admin settings → Releases, starting at Studio only).

Without the settings below, nothing goes to Slack; requests still arrive in the studio under each project's
Requests.

## Setting it up (once, about 10 minutes)
1. Go to api.slack.com/apps → **Create New App** → *From scratch*. Name it **LP Platform**, pick the studio workspace.
2. **OAuth & Permissions → Bot Token Scopes:** add `chat:write`, `users:read`, `channels:history` and
   `reactions:read`. Then **Install to Workspace** and copy the **Bot User OAuth Token** (starts `xoxb-`).
3. **Basic Information → App Credentials:** copy the **Signing Secret**.
4. In Slack, make a channel (e.g. `#client-requests`), type `/invite @LP Platform` in it, and copy its **channel ID**
   (channel name → *About*, at the bottom; starts with `C`).
5. In Vercel → the live project → **Settings → Environment Variables**, add for Production:

| Variable | Value |
| --- | --- |
| `SLACK_BOT_TOKEN` | the `xoxb-…` token |
| `SLACK_SIGNING_SECRET` | the signing secret |
| `SLACK_LP_CHANNEL` | the channel ID |

   Then redeploy (Deployments → the latest → *Redeploy*) so the platform picks them up.
6. Back in the Slack app: **Event Subscriptions → On**, Request URL
   `https://platform.lostproperty.studio/api/slack/events` (it should say *Verified*). Under **Subscribe to bot
   events** add `message.channels` and `reaction_added`, then **Save** and reinstall the app if Slack asks.
7. Test: send a request from a portal's Settings → Requests. It appears in the channel; reply in its thread and
   the reply shows on the request in the portal.
