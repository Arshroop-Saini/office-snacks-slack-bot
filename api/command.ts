import { amazonSearchTool } from "../lib/tools/amazon-search.tool";

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

function formatProductBlocks(products: Product[], page: number, pagination: any, query: string) {
    const blocks = [];
    // Add a header with page info
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: `*Amazon Results for:* \`${query}\`  |  *Page:* ${page}`,
        },
    });
    for (const [i, product] of products.entries()) {
        blocks.push(
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*<${product.url}|${product.title}>*\n${product.description || ""}\n*Price:* ${product.price || "N/A"} ${product.currency || ""}  *Rating:* ${product.rating || "N/A"} (${product.ratings_total || 0})\n*ETA:* ${product.eta || "N/A"}`,
                },
                accessory: product.image
                    ? {
                        type: "image",
                        image_url: product.image,
                        alt_text: product.title,
                    }
                    : undefined,
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: { type: "plain_text", text: "Select" },
                        value: JSON.stringify({ productIndex: i, query, page }),
                        action_id: `select_product_${i}`,
                    },
                ],
            },
            { type: "divider" }
        );
    }
    // Pagination controls
    const paginationElements = [];
    if (pagination && pagination.previous) {
        paginationElements.push({
            type: "button",
            text: { type: "plain_text", text: "Back" },
            value: JSON.stringify({ query, page: page - 1 }),
            action_id: "back_page",
        });
    }
    if (pagination && pagination.next) {
        paginationElements.push({
            type: "button",
            text: { type: "plain_text", text: "Next" },
            value: JSON.stringify({ query, page: page + 1 }),
            action_id: "next_page",
        });
    }
    if (paginationElements.length > 0) {
        blocks.push({
            type: "actions",
            elements: paginationElements,
        });
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
                    setTimeout(async () => {
                        try {
                            const { query, page } = parsedValue;
                            const perPage = 20; // Show all results for the page
                            const { products, pagination: apiPagination } = await amazonSearchTool.execute({ query, page, perPage });
                            const blocks = formatProductBlocks(products, page, apiPagination, query);
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
            const perPage = 20;
            console.log("[COMMAND] Executing Amazon search", { query });
            const { products, page, pagination: apiPagination } = await amazonSearchTool.execute({ query, page: 1, perPage });
            console.log("[COMMAND] Amazon search results", { products, page, apiPagination });
            if (!products.length) {
                console.log("[COMMAND] No products found");
                return new Response(JSON.stringify({ response_type: "ephemeral", text: `No products found for \"${query}\".` }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const blocks = formatProductBlocks(products, page, apiPagination, query);
            return new Response(
                JSON.stringify({
                    response_type: "in_channel",
                    text: `Amazon search results for "${query}":`,
                    blocks,
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        } catch (err: any) {
            console.error("[COMMAND] Error in Amazon search", err);
            return new Response(JSON.stringify({ response_type: "ephemeral", text: `Error: ${err.message}` }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
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
                        const blocks = formatProductBlocks(products, page, apiPagination, query);
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