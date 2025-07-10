import { WebClient } from '@slack/web-api';
import type { CoreMessage } from 'ai'
import crypto from 'crypto'

const signingSecret = process.env.SLACK_SIGNING_SECRET!

export const client = new WebClient(process.env.SLACK_BOT_TOKEN);

// See https://api.slack.com/authentication/verifying-requests-from-slack
export async function isValidSlackRequest({
  request,
  rawBody,
}: {
  request: Request
  rawBody: string
}) {
  const timestamp = request.headers.get('X-Slack-Request-Timestamp')
  const slackSignature = request.headers.get('X-Slack-Signature')

  if (!timestamp || !slackSignature) {
    console.log('Missing timestamp or signature')
    return false
  }

  // Prevent replay attacks on the order of 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 60 * 5) {
    console.log('Timestamp out of range')
    return false
  }

  const base = `v0:${timestamp}:${rawBody}`
  const hmac = crypto
    .createHmac('sha256', signingSecret)
    .update(base)
    .digest('hex')
  const computedSignature = `v0=${hmac}`

  // Prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(slackSignature)
  )
}

export const verifyRequest = async ({
  requestType,
  request,
  rawBody,
}: {
  requestType: string;
  request: Request;
  rawBody: string;
}) => {
  const validRequest = await isValidSlackRequest({ request, rawBody });
  if (!validRequest || requestType !== "event_callback") {
    return new Response("Invalid request", { status: 400 });
  }
};

export const updateStatusUtil = (channel: string, thread_ts: string) => {
  return async (status: string) => {
    try {
      console.log("Setting assistant thread status:", status);
      await client.assistant.threads.setStatus({
        channel_id: channel,
        thread_ts: thread_ts,
        status: status,
      });
      console.log("Assistant thread status set successfully");
    } catch (error) {
      console.error("Error setting assistant thread status:", error);
      // This is expected to fail for non-assistant threads, so we'll just log it
    }
  };
};

export async function getThread(
  channel_id: string,
  thread_ts: string,
  botUserId: string,
): Promise<CoreMessage[]> {
  const { messages } = await client.conversations.replies({
    channel: channel_id,
    ts: thread_ts,
    limit: 50,
  });

  // Ensure we have messages

  if (!messages) throw new Error("No messages found in thread");

  const result = messages
    .map((message) => {
      const isBot = !!message.bot_id;
      if (!message.text) return null;

      // For app mentions, remove the mention prefix
      // For IM messages, keep the full text
      let content = message.text;
      if (!isBot && content.includes(`<@${botUserId}>`)) {
        content = content.replace(`<@${botUserId}> `, "");
      }

      return {
        role: isBot ? "assistant" : "user",
        content: content,
      } as CoreMessage;
    })
    .filter((msg): msg is CoreMessage => msg !== null);

  return result;
}

export const getBotId = async () => {
  const { user_id: botUserId } = await client.auth.test();

  if (!botUserId) {
    throw new Error("botUserId is undefined");
  }
  return botUserId;
};

// Fetch a user's email from Slack given their user_id
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    console.log('[DEBUG] Fetching email for userId:', userId);
    const result = await client.users.info({ user: userId });
    // @ts-ignore
    const email = result.user?.profile?.email || null;
    console.log('[DEBUG] Slack user.info result:', JSON.stringify(result));
    console.log('[DEBUG] Extracted email:', email);
    return email;
  } catch (error) {
    console.error('Error fetching user email from Slack:', error);
    return null;
  }
}

// Fetch a user's email and timezone info from Slack given their user_id
export async function getUserProfile(userId: string): Promise<{ email: string | null, tz: string | null, tz_label: string | null, tz_offset: number | null }> {
  try {
    const result = await client.users.info({ user: userId });
    // @ts-ignore
    const profile = result.user?.profile || {};
    return {
      email: profile.email || null,
      tz: result.user?.tz || null,
      tz_label: result.user?.tz_label || null,
      tz_offset: result.user?.tz_offset || null,
    };
  } catch (error) {
    console.error('Error fetching user profile from Slack:', error);
    return { email: null, tz: null, tz_label: null, tz_offset: null };
  }
}

// Map timezone to office(s)
export function getOfficeForTimezone(tz: string | null, tz_label: string | null): string[] {
  if (!tz && !tz_label) return [];
  if (tz === "America/Argentina/Buenos_Aires" || tz_label?.includes("Argentina")) {
    return ["Buenos Aires"];
  }
  if (tz === "Europe/Madrid" || tz_label?.includes("Madrid") || tz_label?.includes("Central European")) {
    return ["Madrid"];
  }
  if (tz === "America/New_York" || tz_label?.includes("Eastern Daylight")) {
    return ["New York City", "Miami"];
  }
  return [];
}
