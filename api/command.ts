import { amazonSearchTool } from "../lib/tools/amazon-search.tool";
import { generateResponse } from "../lib/generate-response";
import { client } from "../lib/slack-utils";
import type { CoreMessage } from "ai";

export const maxDuration = 60;

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

// Helper to paginate products
function paginateProducts(products: Product[], page: number, perPage: number, totalResults?: number) {
    // Use totalResults if available, otherwise fallback to products.length
    const totalPages = totalResults ? Math.ceil(totalResults / perPage) : Math.ceil(products.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    return {
        pageProducts: products.slice(0, perPage), // always use the current page's products
        totalPages,
    };
}

function formatProductBlocks(products: Product[], page: number, totalPages: number, query: string) {
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
        for (const [i, product] of products.entries()) {
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
    const elements = [];
    // Only show Back if not on first page
    if (page > 1) {
        elements.push({
            type: "button",
            text: { type: "plain_text", text: "Back" },
            value: JSON.stringify({ query, page: page - 1 }),
            action_id: "back_page",
        });
    }
    // Only show Next if not on last page
    if (page < totalPages) {
        elements.push({
            type: "button",
            text: { type: "plain_text", text: "Next" },
            value: JSON.stringify({ query, page: page + 1 }),
            action_id: "next_page",
        });
    }
    if (elements.length > 0) {
        blocks.push({ type: "actions", elements });
    }
    return blocks;
}

export async function POST(request: Request) {
    const contentType = request.headers.get("content-type") || "";
    console.log("[COMMAND] Incoming request", { contentType });

    // 1. Handle Slack block actions sent as x-www-form-urlencoded (the usual case)
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
                // Always respond immediately to avoid Slack timeout
                const responseUrl = payload.response_url;
                if (action.action_id === "next_page" || action.action_id === "back_page") {
                    // Immediately update the message with a loading indicator
                    await fetch(payload.response_url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            response_type: "in_channel",
                            replace_original: true,
                            blocks: [
                                { type: "section", text: { type: "mrkdwn", text: ":hourglass_flowing_sand: Loading page..." } }
                            ]
                        })
                    });
                    setTimeout(async () => {
                        try {
                            const { query, page } = parsedValue;
                            const perPage = 10; // Always 10 per page
                            // First, get the pagination object for the current query (page 1)
                            let pageUrl: string | undefined = undefined;
                            if (page > 1) {
                                // Fetch page 1 to get the correct other_pages URLs
                                const { pagination: firstPagePagination } = await amazonSearchTool.execute({ query, page: 1, perPage });
                                if (firstPagePagination && firstPagePagination.other_pages && firstPagePagination.other_pages[String(page)]) {
                                    pageUrl = firstPagePagination.other_pages[String(page)];
                                }
                            }
                            const { products, pagination: apiPagination } = await amazonSearchTool.execute({ query, page, perPage, pageUrl });
                            let totalPages = 1;
                            if (apiPagination && apiPagination.other_pages) {
                                totalPages = 1 + Object.keys(apiPagination.other_pages).length;
                            }
                            const { pageProducts } = paginateProducts(products, page, perPage, apiPagination?.total_results);
                            const blocks = formatProductBlocks(pageProducts, page, totalPages, query);
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
                            const { productIndex, query, page } = parsedValue;
                            const perPage = 10;
                            // Fetch the products for the current page
                            const { products } = await amazonSearchTool.execute({ query, page, perPage });
                            const product = products[productIndex];
                            if (!product) throw new Error("Product not found for selection");
                            // Simulate a user message with the Amazon URL
                            const userMessage = `Buy this ${product.url}`;
                            // Compose a fake thread for generateResponse
                            const messages: CoreMessage[] = [
                                { role: "user", content: userMessage }
                            ];
                            // Call generateResponse to trigger the order flow
                            const result = await generateResponse(messages);
                            // Post the result back to Slack
                            const responseBody = {
                                response_type: "in_channel",
                                replace_original: false,
                                text: result,
                            };
                            await fetch(responseUrl, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(responseBody),
                            });
                        } catch (err) {
                            console.error("[COMMAND] (async) Error in select_product order flow:", err);
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
            const perPage = 10; // Always 10 per page
            console.log("[COMMAND] Executing Amazon search", { query });
            const { products, pagination: apiPagination } = await amazonSearchTool.execute({ query, page: 1, perPage });
            console.log('[DEBUG] apiPagination:', JSON.stringify(apiPagination, null, 2));
            // Use total_results or total_pages from apiPagination if available
            let totalPages = 1;
            if (apiPagination && apiPagination.other_pages) {
                totalPages = 1 + Object.keys(apiPagination.other_pages).length;
            }
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
            const { pageProducts } = paginateProducts(products, 1, perPage, apiPagination?.total_results);
            const blocks = formatProductBlocks(pageProducts, 1, totalPages, query);
            const responseBody: any = {
                response_type: "in_channel",
                text: `Amazon search results for \"${query}\":`,
            };
            if (blocks && blocks.length > 0) {
                responseBody.blocks = blocks;
            }
            console.log("[COMMAND] Slash command response body:", JSON.stringify(responseBody));
            return new Response(
                JSON.stringify(responseBody),
                { status: 200, headers: { "Content-Type": "application/json" } }
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
                        const blocks = formatProductBlocks(pageProducts, page, totalPages, query);
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