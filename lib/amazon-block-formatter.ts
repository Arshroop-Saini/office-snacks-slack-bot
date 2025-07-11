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

type SlackBlock = {
    type: string;
    text?: {
        type: string;
        text: string;
    };
    accessory?: {
        type: string;
        image_url: string;
        alt_text: string;
    };
    elements?: any[];
};

// Helper to generate pagination buttons with optional disabled state
export function getPaginationElements(query: string, page: number, totalPages: number, loading: boolean = false): any[] {
    const elements: any[] = [];
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

export function formatProductBlocksStateless(products: Product[], page: number, totalPages: number, query: string, loading: boolean = false): any[] {
    const blocks: any[] = [];
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
    // Pagination controls (only for paginated results, not for AI responses)
    if (totalPages > 1) {
        const elements = getPaginationElements(query, page, totalPages, loading);
        if (elements.length > 0) {
            blocks.push({ type: "actions", elements });
        }
    }
    return blocks;
}

export type { Product }; 