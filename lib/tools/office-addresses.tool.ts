import { z } from "zod";
import { getUserProfile, getOfficeForTimezone } from "../slack-utils";

/**
 * Office addresses web tool with timezone detection
 */
export const officeAddressesTool = {
  name: "get_office_addresses",
  description: "Get the addresses of the offices, optionally filtered by user timezone",
  parameters: z.object({
    userId: z.string().optional().describe("Slack user ID to determine office based on timezone"),
  }),
  execute: async ({ userId }: { userId?: string }) => {
    const allOffices = JSON.parse(process.env.OFFICE_ADDRESSES || "[]");

    // If no userId provided, return all offices
    if (!userId) {
      return {
        offices: allOffices,
        userTimezone: null,
        suggestedOffices: [],
        message: "All available offices"
      };
    }

    try {
      // Get user's timezone from Slack
      const { tz, tz_label } = await getUserProfile(userId);
      const suggestedOfficeNames = getOfficeForTimezone(tz, tz_label);

      // Filter offices based on timezone
      const suggestedOffices = allOffices.filter((office: any) =>
        suggestedOfficeNames.some(name => office.name.includes(name))
      );

      return {
        offices: allOffices,
        userTimezone: { tz, tz_label },
        suggestedOffices,
        suggestedOfficeNames,
        message: suggestedOffices.length > 0
          ? `Based on your timezone (${tz_label}), we suggest: ${suggestedOfficeNames.join(", ")}`
          : `Could not determine office from your timezone (${tz_label}). Please choose from available offices.`
      };
    } catch (error) {
      console.error("Error getting user timezone:", error);
      return {
        offices: allOffices,
        userTimezone: null,
        suggestedOffices: [],
        message: "Could not determine timezone. Please choose from available offices."
      };
    }
  },
};
