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

function formatProductBlocks(products: Product[], page: number, hasNextPage: boolean, query: string) {
    const blocks = [];
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
                        value: JSON.stringify({ productIndex: i }),
                        action_id: `select_product_${i}`,
                    },
                ],
            },
            { type: "divider" }
        );
    }
    if (hasNextPage) {
        blocks.push({
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: { type: "plain_text", text: "Next Page" },
                    value: JSON.stringify({ query, page: page + 1 }),
                    action_id: "next_page",
                },
            ],
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
                if (action.action_id === "next_page") {
                    // Respond immediately
                    setTimeout(async () => {
                        try {
                            const { query, page } = parsedValue;
                            const perPage = 10;
                            const { products, hasNextPage } = await amazonSearchTool.execute({ query, page, perPage });
                            const blocks = formatProductBlocks(products, page, hasNextPage, query);
                            const responseBody = {
                                response_type: "in_channel",
                                replace_original: true,
                                blocks,
                            };
                            console.log("[COMMAND] (async) Responding to next_page with:", JSON.stringify(responseBody, null, 2));
                            await fetch(responseUrl, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(responseBody),
                            });
                        } catch (err) {
                            console.error("[COMMAND] (async) Error in next_page:", err);
                        }
                    }, 0);
                    // Immediate response
                    return new Response(JSON.stringify({ text: "Loading next page...", response_type: "ephemeral" }), {
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
            const perPage = 10;
            console.log("[COMMAND] Executing Amazon search", { query });
            const { products, page, totalResults } = await amazonSearchTool.execute({ query, page: 1, perPage });
            const hasNextPage = (page * perPage) < totalResults;
            console.log("[COMMAND] Amazon search results", { products, page, hasNextPage });
            if (!products.length) {
                console.log("[COMMAND] No products found");
                return new Response(JSON.stringify({ response_type: "ephemeral", text: `No products found for \"${query}\".` }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const blocks = formatProductBlocks(products, page, hasNextPage, query);
            return new Response(
                JSON.stringify({
                    response_type: "in_channel",
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
            if (action.action_id === "next_page") {
                setTimeout(async () => {
                    try {
                        const { query, page } = parsedValue;
                        const perPage = 10;
                        const { products, hasNextPage } = await amazonSearchTool.execute({ query, page, perPage });
                        const blocks = formatProductBlocks(products, page, hasNextPage, query);
                        const responseBody = {
                            response_type: "in_channel",
                            replace_original: true,
                            blocks,
                        };
                        console.log("[COMMAND] (async) Responding to next_page with:", JSON.stringify(responseBody, null, 2));
                        await fetch(responseUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(responseBody),
                        });
                    } catch (err) {
                        console.error("[COMMAND] (async) Error in next_page:", err);
                    }
                }, 0);
                return new Response(JSON.stringify({ text: "Loading next page...", response_type: "ephemeral" }), {
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