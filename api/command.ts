import { amazonSearchTool } from "../lib/tools/amazon-search.tool";
import { generateResponse } from "../lib/generate-response";
import { client } from "../lib/slack-utils";
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
};

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
        for (const product of products) {
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*<${product.url}|${product.title}>*\n\n*Price:* ${product.price ?? "N/A"}   *Rating:* ${product.rating ?? "N/A"} (${product.ratings_total ?? "N/A"})\n*ETA:* ${product.eta ?? "N/A"}`,
                },
                accessory: product.image ? {
                    type: "image",
                    image_url: product.image,
                    alt_text: product.title,
                } : undefined,
            });
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
                // Show instant loading indicator with disabled buttons
                const { query, page } = parsedValue;
                const perPage = 10;
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
                    const blocks = formatProductBlocksStateless(products, page, totalPages, query);
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
            const perPage = 10;
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
            const blocks = formatProductBlocksStateless(products, page, totalPages, query);
            const responseBody = {
                response_type: "in_channel",
                text: `Amazon search results for \"${query}\":`,
                blocks,
            };
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
                        const perPage = 20; // Show all results for the page
                        const { products, pagination: apiPagination } = await amazonSearchTool.execute({ query, page, perPage });
                        const { pageProducts, totalPages } = paginateProducts(products, page, perPage);
                        const blocks = formatProductBlocksStateless(pageProducts, page, totalPages, query); // Pass products for context
                        const responseBody = {
                            response_type: "in_channel",
                            replace_original: true,
                            blocks,
                        };
                        console.log(`[COMMAND] (async) Responding to ${action.action_id} with:`, JSON.stringify(responseBody, null, 2));
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