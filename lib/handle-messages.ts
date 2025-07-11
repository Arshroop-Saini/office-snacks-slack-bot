import { generateResponse } from "./generate-response";
import { client } from "./slack-utils";
import type { GenericMessageEvent } from "@slack/web-api";

export const handleMessages = async (
  event: GenericMessageEvent,
  updateStatus?: (status: string) => void
) => {
  try {
    // Type guard to check if this is a regular message event with text
    if (!('text' in event) || !('user' in event) || !event.text || !event.user) {
      console.log("Skipping message event without text or user");
      return;
    }

    console.log("📝 Handling message event:", event.text);

    // Get user profile to fetch email
    let userEmail: string | undefined;
    try {
      const userInfo = await client.users.info({ user: event.user });
      userEmail = userInfo.user?.profile?.email || undefined;
      console.log("📧 User email from profile:", userEmail);
    } catch (error) {
      console.error("Failed to fetch user email:", error);
    }

    // Generate AI response with thread context
    const response = await generateResponse(
      [{ role: "user", content: event.text }],
      updateStatus,
      userEmail,
      event.user,
      event.thread_ts || event.ts,
      event.channel
    );

    // Send response with blocks if available
    const messagePayload: any = {
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
    };

    if (response.blocks) {
      messagePayload.blocks = response.blocks;
      messagePayload.text = response.text; // Fallback text for notifications
    } else {
      messagePayload.text = response.text;
    }

    await client.chat.postMessage(messagePayload);
  } catch (error) {
    console.error("Error in message handler:", error);
    // Only try to post error message if we have proper event structure
    if ('channel' in event && 'ts' in event) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: ('thread_ts' in event ? event.thread_ts : undefined) || event.ts,
        text: "Sorry, I encountered an error processing your request. Please try again.",
      });
    }
  }
};
