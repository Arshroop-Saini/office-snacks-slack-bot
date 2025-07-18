import { z } from "zod";

// Order data types based on actual Crossmint API response
interface CrossmintOrder {
    topology: string;
    orderId: string;
    recipient: string;
    quantity: number;
    paymentMethod: string;
    paymentStatus: string;
    totalPrice: {
        amount: number;
        currency: string;
    };
    deliveryStatus: string;
    createdAt: string;
    origin: string;
    clientId: string;
    chain: string;
    totalSaleQuote: {
        amount: number;
        currency: string;
    };
}

interface CrossmintOrdersResponse {
    orders: CrossmintOrder[];
    pagination: {
        page: number;
        perPage: number;
        totalPages: number;
        totalOrders: number;
    };
}

/**
 * Crossmint Orders API client tool
 */
export const crossmintOrdersTool = {
    name: "fetch_user_orders",
    description: "Fetch order history for a user from Crossmint using their email address.",
    parameters: z.object({
        email: z.string().email().describe("The user's email address to fetch orders for."),
        page: z.number().min(1).default(1).describe("The page number for pagination (optional)."),
        perPage: z.number().min(1).max(20).default(5).describe("Number of orders per page (optional, max 20)."),
    }),
    execute: async ({ email, page = 1, perPage = 5 }: { email: string; page?: number; perPage?: number }): Promise<CrossmintOrdersResponse> => {
        const apiKey = process.env.CROSSMINT_API_KEY;
        if (!apiKey) {
            throw new Error("CROSSMINT_API_KEY is not set in environment variables");
        }

        const url = `https://staging.crossmint.com/api/2025-06-15/orders?recipient=${encodeURIComponent(email)}&page=${page}&perPage=${perPage}`;

        console.log(`[CROSSMINT ORDERS] Fetching orders for email: ${email}, page: ${page}, perPage: ${perPage}`);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json',
                },
            });

            const responseBody = await response.text();

            if (!response.ok) {
                console.error("[CROSSMINT ORDERS] API error", {
                    status: response.status,
                    statusText: response.statusText,
                    body: responseBody
                });

                // Handle specific error cases
                if (response.status === 404) {
                    // No orders found - return empty result
                    return {
                        orders: [],
                        pagination: {
                            page: 1,
                            perPage: perPage,
                            totalPages: 0,
                            totalOrders: 0
                        }
                    };
                }

                if (response.status === 401 || response.status === 403) {
                    throw new Error("Authentication failed - invalid API key");
                }

                throw new Error(`Crossmint API error: ${response.status} ${response.statusText}`);
            }

            const data = JSON.parse(responseBody);
            console.log(`[CROSSMINT ORDERS] Raw API response:`, JSON.stringify(data, null, 2));
            console.log(`[CROSSMINT ORDERS] Successfully fetched ${data.orders?.length || 0} orders`);

            // Ensure we have the expected response structure
            const result = {
                orders: data.orders || [],
                pagination: {
                    page: data.pagination?.page || page,
                    perPage: data.pagination?.perPage || perPage,
                    totalPages: data.pagination?.totalPages || 1,
                    totalOrders: data.pagination?.total || (data.orders?.length || 0)
                }
            };

            console.log(`[CROSSMINT ORDERS] Processed result:`, {
                ordersCount: result.orders.length,
                pagination: result.pagination,
                firstOrder: result.orders[0] ? {
                    orderId: result.orders[0].orderId,
                    paymentStatus: result.orders[0].paymentStatus,
                    deliveryStatus: result.orders[0].deliveryStatus,
                    totalPrice: result.orders[0].totalPrice
                } : null
            });

            return result;

        } catch (error) {
            console.error("[CROSSMINT ORDERS] Error fetching orders:", error);

            // Re-throw with more context for better error handling
            if (error instanceof Error) {
                throw new Error(`Failed to fetch order history: ${error.message}`);
            }

            throw new Error("Failed to fetch order history: Unknown error occurred");
        }
    },
};

// Export types for use in other files
export type { CrossmintOrder, CrossmintOrdersResponse }; 