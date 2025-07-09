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
    if (contentType.includes("application/json")) {
        // Handle Slack interactivity payloads
        const payload = await request.json();
        if (payload.type === "block_actions") {
            const action = payload.actions[0];
            if (action.action_id === "next_page") {
                const { query, page } = JSON.parse(action.value);
                const { products, hasNextPage } = await amazonSearchTool.execute({ query, page, perPage: 5 });
                const blocks = formatProductBlocks(products, page, hasNextPage, query);
                return new Response(
                    JSON.stringify({
                        response_type: "in_channel",
                        replace_original: true,
                        blocks,
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            } else if (action.action_id.startsWith("select_product_")) {
                // Product selection: confirm and trigger order flow (placeholder)
                const productIndex = JSON.parse(action.value).productIndex;
                const originalQuery = payload.message?.blocks?.[0]?.text?.text?.match(/for: (.*)/)?.[1] || "";
                // For now, just confirm selection
                return new Response(
                    JSON.stringify({
                        response_type: "in_channel",
                        replace_original: false,
                        text: `You selected product #${productIndex + 1}. (Order flow to be implemented)`
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }
        }
        return new Response("", { status: 200 });
    }

    // Handle slash command
    const formData = await request.text();
    const params = Object.fromEntries(new URLSearchParams(formData));

    if (!params.command || params.command !== "/amazon") {
        return new Response("Unknown command", { status: 400 });
    }

    const query = params.text?.trim();
    if (!query) {
        return new Response(JSON.stringify({ response_type: "ephemeral", text: "Please provide a search query." }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const { products, page, hasNextPage } = await amazonSearchTool.execute({ query, page: 1, perPage: 5 });
        if (!products.length) {
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
        return new Response(JSON.stringify({ response_type: "ephemeral", text: `Error: ${err.message}` }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
} 