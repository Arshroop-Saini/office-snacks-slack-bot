import { amazonSearchTool } from "../lib/tools/amazon-search.tool";
import { generateResponse } from "../lib/generate-response";
import { client } from "../lib/slack-utils";
import { storeRecentSearch, storeThreadSearch } from "../lib/search-context";
import { formatProductBlocksStateless, getPaginationElements, type Product } from "../lib/amazon-block-formatter";
import type { CoreMessage } from "ai";

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
                // Show instant loading indicator with disabled buttons
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

                    // Store recent search context for conversational enhancement (pagination)
                    storeRecentSearch(payload.channel.id, payload.user.id, query);

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
            return new Response("", { status: 200 });
        }
        // Otherwise, treat as a slash command
        console.log("[COMMAND] Raw form data", formData);
        console.log("[COMMAND] Parsed params", params);
        if (!params.command || params.command !== "/amazon") {
            console.log("[COMMAND] Unknown command", params.command);
            return new Response("Unknown command", { status: 400 });
        }
        const query = params.text?.trim();
        if (!query) {
            console.log("[COMMAND] No query provided");
            return new Response(JSON.stringify({ response_type: "ephemeral", text: "Please provide a search query." }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }
        try {
            const perPage = 5;
            const page = 1;
            const { products, pagination } = await amazonSearchTool.execute({ query, page, perPage });
            if (!products.length) {
                console.log("[COMMAND] No products found");
                return new Response(
                    JSON.stringify({
                        response_type: "ephemeral",
                        text: `No products found for \"${query}\".`
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
            const totalPages = pagination && pagination.other_pages ? Object.keys(pagination.other_pages).length + 1 : 1;
            const blocks = formatProductBlocksStateless(products.slice(0, 5), page, totalPages, query);
            const responseBody = {
                response_type: "in_channel",
                text: `Amazon search results for \"${query}\":`,
                blocks,
            };
            console.log("[COMMAND] Slash command response body:", JSON.stringify(responseBody));

            // Store recent search context for conversational enhancement
            console.log(`[COMMAND] 🔍 Storing search context with keys:`, {
                channel_id: params.channel_id,
                user_id: params.user_id,
                query: query,
                key: `${params.channel_id}-${params.user_id}`
            });
            storeRecentSearch(params.channel_id, params.user_id, query);

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
            if (action.action_id === "next_page" || action.action_id === "back_page") {
                setTimeout(async () => {
                    try {
                        const { query, page } = parsedValue;
                        const perPage = 5;
                        const { products, pagination: apiPagination } = await amazonSearchTool.execute({ query, page, perPage });
                        const totalPages = apiPagination && apiPagination.other_pages ? Object.keys(apiPagination.other_pages).length + 1 : page;
                        const blocks = formatProductBlocksStateless(products.slice(0, 5), page, totalPages, query);
                        const responseBody = {
                            response_type: "in_channel",
                            replace_original: true,
                            blocks,
                        };
                        console.log(`[COMMAND] (async) Responding to ${action.action_id} with:`, JSON.stringify(responseBody, null, 2));

                        // Store recent search context for conversational enhancement (async pagination)
                        storeRecentSearch(payload.channel.id, payload.user.id, query);

                        await fetch(responseUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(responseBody),
                        });
                    } catch (err) {
                        console.error(`[COMMAND] (async) Error in ${action.action_id}:`, err);
                    }
                }, 0);
                return new Response(JSON.stringify({ text: `Loading page...`, response_type: "ephemeral" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            } else if (action.action_id.startsWith("select_product_")) {
                setTimeout(async () => {
                    try {
                        const { productIndex } = parsedValue;
                        const responseBody = {
                            response_type: "in_channel",
                            replace_original: false,
                            text: `You selected product #${productIndex + 1}. (Order flow to be implemented)`
                        };
                        console.log("[COMMAND] (async) Responding to select_product with:", JSON.stringify(responseBody, null, 2));
                        await fetch(responseUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(responseBody),
                        });
                    } catch (err) {
                        console.error("[COMMAND] (async) Error in select_product:", err);
                    }
                }, 0);
                return new Response(JSON.stringify({ text: "Processing selection...", response_type: "ephemeral" }), {
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