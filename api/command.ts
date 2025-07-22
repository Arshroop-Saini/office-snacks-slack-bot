import { amazonSearchTool } from "../lib/tools/amazon-search.tool";
import { crossmintOrdersTool } from "../lib/tools/crossmint-orders.tool";
import type { CrossmintOrder } from "../lib/tools/crossmint-orders.tool";
import { generateResponse } from "../lib/generate-response";
import { client, getUserEmail, getBotId } from "../lib/slack-utils";
import type { CoreMessage } from "ai";

type Product = {
    title: string;
    url: string;
    image?: string;
    price?: string;
    currency?: string;
    rating?: number;
    ratings_total?: number;
    eta?: string;
    description?: string;
    asin?: string; // <-- add this line
};

// ASIN Detection and Validation Functions
function isASIN(query: string): boolean {
    const asinPattern = /^B[0-9A-Z]{9}$/;
    return asinPattern.test(query.trim().toUpperCase());
}

function validateASIN(asin: string): { valid: boolean; normalized: string } {
    const normalized = asin.trim().toUpperCase();
    return {
        valid: /^B[0-9A-Z]{9}$/.test(normalized) && normalized.length === 10,
        normalized
    };
}

export const maxDuration = 60;

const MAX_PRODUCTS = 20; // Reduce for Slack payload safety

// Only cache minimal fields for context
function minimalProduct(product: Product) {
    return {
        title: product.title,
        url: product.url,
        image: product.image,
        price: product.price,
        rating: product.rating,
        ratings_total: product.ratings_total,
        eta: product.eta,
    };
}

// Helper to paginate products
function paginateProducts(products: Product[], page: number, perPage: number) {
    const totalPages = Math.ceil(products.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    return {
        pageProducts: products.slice(start, end),
        totalPages,
    };
}

// Helper to generate pagination buttons with optional disabled state
function getPaginationElements(query: string, page: number, totalPages: number, loading: boolean = false) {
    const elements = [];
    if (page > 1) {
        elements.push({
            type: "button",
            text: { type: "plain_text", text: "Back" },
            value: JSON.stringify({ query, page: page - 1 }),
            action_id: "back_page",
            ...(loading ? { style: "danger", disabled: true } : {})
        });
    }
    if (page < totalPages) {
        elements.push({
            type: "button",
            text: { type: "plain_text", text: "Next" },
            value: JSON.stringify({ query, page: page + 1 }),
            action_id: "next_page",
            ...(loading ? { style: "danger", disabled: true } : {})
        });
    }
    return elements;
}

// Order-specific pagination buttons (separate from Amazon search)
function getOrderPaginationElements(userEmail: string, page: number, totalPages: number, loading: boolean = false) {
    const elements = [];
    if (page > 1) {
        elements.push({
            type: "button",
            text: { type: "plain_text", text: "Back" },
            value: JSON.stringify({ userEmail, page: page - 1 }),
            action_id: "orders_back_page",
            ...(loading ? { style: "danger", disabled: true } : {})
        });
    }
    if (page < totalPages) {
        elements.push({
            type: "button",
            text: { type: "plain_text", text: "Next" },
            value: JSON.stringify({ userEmail, page: page + 1 }),
            action_id: "orders_next_page",
            ...(loading ? { style: "danger", disabled: true } : {})
        });
    }
    return elements;
}

// Order formatting function (Phase 3 implementation)
function formatOrderBlocksStateless(orders: CrossmintOrder[], page: number, totalPages: number, userEmail: string, loading: boolean = false) {
    const blocks = [];
    // Header
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: `*Order History for:* ${userEmail}  |  *Page:* ${page} of ${totalPages}`,
        },
    });

    // Orders
    if (orders.length === 0) {
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: "📦 No orders found for this page." },
        });
    } else {
        for (const order of orders) {
            const orderDate = new Date(order.createdAt).toLocaleDateString();
            const orderTime = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Format status combining payment and delivery status
            const statusText = `${order.paymentStatus} / ${order.deliveryStatus}`;

            // Format total price
            const totalText = `$${order.totalPrice.amount} ${order.totalPrice.currency.toUpperCase()}`;

            // Format items info (since no individual product names, use origin and quantity)
            const itemsText = `${order.quantity}x ${order.origin} item${order.quantity > 1 ? 's' : ''}`;

            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Order #${order.orderId.slice(0, 8)}...*\n*Date:* ${orderDate} at ${orderTime}\n*Status:* ${statusText}\n*Total:* ${totalText}\n*Items:* ${itemsText}\n*Payment:* ${order.paymentMethod.toUpperCase()}`,
                },
            });
            blocks.push({ type: "divider" });
        }
    }

    // Pagination controls for orders (separate from Amazon)
    const elements = getOrderPaginationElements(userEmail, page, totalPages, loading);
    if (elements.length > 0) {
        blocks.push({ type: "actions", elements });
    }
    return blocks;
}

function formatProductBlocksStateless(products: Product[], page: number, totalPages: number, query: string, loading: boolean = false) {
    const blocks = [];
    // Header
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: `*Amazon Results for:* \`${query}\`  |  *Page:* ${page} of ${totalPages}`,
        },
    });
    // Products
    if (products.length === 0) {
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: ":warning: No products found for this page." },
        });
    } else {
        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*<${product.url}|${product.title}>*\n\n*Price:* ${product.price ?? "N/A"}   *Rating:* ${product.rating ?? "N/A"} (${product.ratings_total ?? "N/A"})\n*ETA:* ${product.eta ?? "N/A"}\n*ASIN:* ${product.asin ?? "N/A"}`,
                },
                accessory: product.image ? {
                    type: "image",
                    image_url: product.image,
                    alt_text: product.title,
                } : undefined,
            });

            // Add "Select This" button for each product
            if (product.asin) {
                blocks.push({
                    type: "actions",
                    elements: [{
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "🛒 Select This",
                            emoji: true
                        },
                        value: JSON.stringify({
                            asin: product.asin,
                            productIndex: i,
                            productTitle: product.title
                        }),
                        action_id: `select_product_${i}`,
                        style: "primary"
                    }]
                });
            }

            blocks.push({ type: "divider" });
        }
    }
    // Pagination controls
    const elements = getPaginationElements(query, page, totalPages, loading);
    if (elements.length > 0) {
        blocks.push({ type: "actions", elements });
    }
    return blocks;
}

export async function POST(request: Request) {
    const contentType = request.headers.get("content-type") || "";
    console.log("[COMMAND] Incoming request", { contentType });

    if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await request.text();
        const params = Object.fromEntries(new URLSearchParams(formData));
        if (params.payload) {
            // This is a block action
            const payload = JSON.parse(params.payload);
            console.log("[COMMAND] Interactivity payload", JSON.stringify(payload, null, 2));
            if (payload.type === "block_actions") {
                const action = payload.actions[0];
                let parsedValue;
                try {
                    parsedValue = JSON.parse(action.value);
                    console.log(`[COMMAND] Parsed action.value for ${action.action_id}:`, parsedValue);
                } catch (err) {
                    console.error(`[COMMAND] Failed to parse action.value for ${action.action_id}:`, action.value, err);
                    return new Response(JSON.stringify({ response_type: "ephemeral", text: `Error: Invalid button value format.` }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                // Handle Amazon search pagination
                if (action.action_id === "next_page" || action.action_id === "back_page") {
                    const { query, page } = parsedValue;
                    const perPage = 5;
                    const loadingBlocks = formatProductBlocksStateless([], page, page, query, true);
                    await fetch(payload.response_url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ response_type: "ephemeral", text: "Loading page...", blocks: loadingBlocks }),
                    });
                    // Fetch new page from SearchApi.io
                    try {
                        const { products, pagination } = await amazonSearchTool.execute({ query, page, perPage });
                        const totalPages = pagination && pagination.other_pages ? Object.keys(pagination.other_pages).length + 1 : page;
                        const blocks = formatProductBlocksStateless(products.slice(0, 5), page, totalPages, query);
                        const responseBody = {
                            response_type: "in_channel",
                            replace_original: true,
                            blocks,
                        };
                        await fetch(payload.response_url, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(responseBody),
                        });
                    } catch (err) {
                        console.error(`[COMMAND] Error fetching page:`, err);
                        await fetch(payload.response_url, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ response_type: "ephemeral", text: `:warning: Failed to load page. Please try again.` }),
                        });
                    }
                    return new Response("", { status: 200 });
                }
                // Handle orders pagination
                else if (action.action_id === "orders_next_page" || action.action_id === "orders_back_page") {
                    const { userEmail, page } = parsedValue;
                    const perPage = 5;
                    console.log(`[COMMAND] Loading orders page ${page} for email: ${userEmail}`);

                    try {
                        const { orders, pagination: orderPagination } = await crossmintOrdersTool.execute({
                            email: userEmail,
                            page,
                            perPage
                        });

                        const blocks = formatOrderBlocksStateless(orders, orderPagination.page, orderPagination.totalPages, userEmail);
                        const responseBody = {
                            response_type: "in_channel",
                            replace_original: true,
                            blocks,
                        };
                        await fetch(payload.response_url, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(responseBody),
                        });
                    } catch (err) {
                        console.error(`[COMMAND] Error in orders pagination:`, err);
                        await fetch(payload.response_url, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ response_type: "ephemeral", text: `:warning: Failed to load orders page. Please try again.` }),
                        });
                    }
                    return new Response("", { status: 200 });
                }
            }
            return new Response("", { status: 200 });
        }
        // Otherwise, treat as a slash command
        console.log("[COMMAND] Raw form data", formData);
        console.log("[COMMAND] Parsed params", params);
        // Handle different slash commands
        if (params.command === "/amazon") {
            const query = params.text?.trim();
            if (!query) {
                console.log("[COMMAND] No query provided");
                return new Response(JSON.stringify({ response_type: "ephemeral", text: "Please provide a search query." }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }

            // ASIN Detection and Validation
            const isAsinQuery = isASIN(query);
            if (isAsinQuery) {
                const validation = validateASIN(query);
                if (!validation.valid) {
                    console.log("[COMMAND] Invalid ASIN format:", query);
                    return new Response(
                        JSON.stringify({
                            response_type: "ephemeral",
                            text: `❌ Invalid ASIN format. ASINs should be 10 characters starting with 'B' (e.g., B0DWQC12R5).`
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }
                console.log("[COMMAND] ASIN lookup detected for:", validation.normalized);
            }

            try {
                const perPage = 5;
                const page = 1;
                const { products, pagination } = await amazonSearchTool.execute({ query: isAsinQuery ? validateASIN(query).normalized : query, page, perPage });
                if (!products.length) {
                    console.log("[COMMAND] No products found");
                    const errorText = isAsinQuery
                        ? `❌ Product with ASIN \`${validateASIN(query).normalized}\` not found on Amazon US. Please verify the ASIN or try a different search.`
                        : `No products found for \"${query}\".`;
                    return new Response(
                        JSON.stringify({
                            response_type: "ephemeral",
                            text: errorText
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }

                // Optimize display for ASIN queries vs regular searches
                let responseBody;
                if (isAsinQuery) {
                    // For ASIN queries: single product, no pagination
                    const blocks = formatProductBlocksStateless([products[0]], 1, 1, validateASIN(query).normalized, false);
                    responseBody = {
                        response_type: "in_channel",
                        text: `Product Details for ASIN: \`${validateASIN(query).normalized}\``,
                        blocks,
                    };
                } else {
                    // For regular searches: multiple products with pagination
                    const totalPages = pagination && pagination.other_pages ? Object.keys(pagination.other_pages).length + 1 : 1;
                    const blocks = formatProductBlocksStateless(products.slice(0, 5), page, totalPages, query);
                    responseBody = {
                        response_type: "in_channel",
                        text: `Amazon search results for \"${query}\":`,
                        blocks,
                    };
                }
                console.log("[COMMAND] Slash command response body:", JSON.stringify(responseBody));
                return new Response(
                    JSON.stringify(responseBody),
                    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
                );
            } catch (err) {
                console.error("[COMMAND] Error in Amazon search", err);
                return new Response(
                    JSON.stringify({
                        response_type: "ephemeral",
                        text: "Sorry, there was an error searching Amazon. Please try again later."
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
        } else if (params.command === "/orders") {
            // Handle /orders command
            console.log("[COMMAND] Processing /orders command");

            try {
                // Get user email from Slack user ID
                const userId = params.user_id;
                if (!userId) {
                    console.log("[COMMAND] No user ID provided");
                    return new Response(
                        JSON.stringify({
                            response_type: "ephemeral",
                            text: "❌ Could not identify user for order lookup."
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }

                const userEmail = await getUserEmail(userId);
                if (!userEmail) {
                    console.log("[COMMAND] Could not retrieve user email");
                    return new Response(
                        JSON.stringify({
                            response_type: "ephemeral",
                            text: "❌ Could not retrieve your email address. Please ensure your Slack profile has an email configured."
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }

                console.log(`[COMMAND] Fetching orders for email: ${userEmail}`);

                // Fetch orders from Crossmint
                const { orders, pagination } = await crossmintOrdersTool.execute({
                    email: userEmail,
                    page: 1,
                    perPage: 5
                });

                console.log(`[COMMAND] Orders API response:`, {
                    ordersCount: orders.length,
                    pagination: pagination,
                    firstOrder: orders[0] ? {
                        orderId: orders[0].orderId,
                        status: `${orders[0].paymentStatus}/${orders[0].deliveryStatus}`,
                        total: orders[0].totalPrice,
                        createdAt: orders[0].createdAt,
                        quantity: orders[0].quantity,
                        origin: orders[0].origin
                    } : null,
                    allOrders: orders.map(order => ({
                        orderId: order.orderId,
                        paymentStatus: order.paymentStatus,
                        deliveryStatus: order.deliveryStatus,
                        totalPrice: order.totalPrice,
                        createdAt: order.createdAt
                    }))
                });

                if (!orders.length) {
                    console.log("[COMMAND] No orders found for user");
                    return new Response(
                        JSON.stringify({
                            response_type: "ephemeral",
                            text: "📦 No previous orders found for your account. Start shopping with `/amazon [search query]`!"
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    );
                }

                // Format orders for display
                const blocks = formatOrderBlocksStateless(orders, pagination.page, pagination.totalPages, userEmail);
                console.log(`[COMMAND] Generated ${blocks.length} blocks for orders display`);

                return new Response(
                    JSON.stringify({
                        response_type: "in_channel",
                        text: `Your order history:`,
                        blocks,
                    }),
                    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
                );

            } catch (err) {
                console.error("[COMMAND] Error in orders lookup", err);
                return new Response(
                    JSON.stringify({
                        response_type: "ephemeral",
                        text: "❌ Unable to retrieve order history. Please try again later or contact support."
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
        } else {
            console.log("[COMMAND] Unknown command", params.command);
            return new Response("Unknown command", { status: 400 });
        }
    }

    // 2. Handle Slack interactivity payloads as application/json (rare, but possible)
    if (contentType.includes("application/json")) {
        const payload = await request.json();
        console.log("[COMMAND] Interactivity payload", JSON.stringify(payload, null, 2));
        if (payload.type === "block_actions") {
            const action = payload.actions[0];
            let parsedValue;
            try {
                parsedValue = JSON.parse(action.value);
                console.log(`[COMMAND] Parsed action.value for ${action.action_id}:`, parsedValue);
            } catch (err) {
                console.error(`[COMMAND] Failed to parse action.value for ${action.action_id}:`, action.value, err);
                return new Response(JSON.stringify({ response_type: "ephemeral", text: `Error: Invalid button value format.` }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const responseUrl = payload.response_url;

            if (action.action_id.startsWith("select_product_")) {
                setTimeout(async () => {
                    try {
                        const { asin, productIndex, productTitle } = parsedValue;

                        // Get channel and message timestamp for threading
                        const channelId = payload.container.channel_id;
                        const messageTs = payload.container.message_ts;

                        console.log("[COMMAND] Creating threaded buy command for:", { asin, productTitle, channelId, messageTs });

                        // Get bot user ID and create buy command
                        const botUserId = await getBotId();
                        const buyCommand = `<@${botUserId}> buy me this ${asin}`;

                        await client.chat.postMessage({
                            channel: channelId,
                            thread_ts: messageTs, // Reply to the search results message
                            text: buyCommand,
                            unfurl_links: false
                        });

                        console.log("[COMMAND] Posted threaded buy command successfully");

                        // Send ephemeral response to the button clicker
                        const responseBody = {
                            response_type: "ephemeral",
                            text: "✅ Buy command posted in thread! The bot will process it automatically."
                        };

                        await fetch(responseUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(responseBody),
                        });
                    } catch (err) {
                        console.error("[COMMAND] (async) Error in select_product:", err);
                        // Send error response
                        await fetch(responseUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                response_type: "ephemeral",
                                text: "❌ Error creating buy command. Please try again."
                            }),
                        });
                    }
                }, 0);
                return new Response(JSON.stringify({ text: "Creating buy command...", response_type: "ephemeral" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }
        return new Response("", { status: 200 });
    }

    // Fallback: unsupported content type
    return new Response("Unsupported content type", { status: 400 });
} 