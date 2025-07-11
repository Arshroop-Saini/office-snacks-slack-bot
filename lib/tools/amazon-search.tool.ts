import { z } from "zod";

/**
 * Amazon product search tool using SearchApi.io
 */
export const amazonSearchTool = {
    name: "search_amazon_products",
    description: "Search for Amazon products by name or description and return a list of relevant products with details.",
    parameters: z.object({
        query: z.string().describe("The product name or description to search for."),
        page: z.number().min(1).default(1).describe("The page number for pagination (optional)."),
        perPage: z.number().min(1).max(20).default(5).describe("Number of products per page (optional, max 20)."),
    }),
    execute: async ({ query, page = 1, perPage = 5, pageUrl }: { query: string; page?: number; perPage?: number; pageUrl?: string }) => {
        const apiKey = process.env.SEARCH_API_KEY;
        if (!apiKey) throw new Error("SEARCH_API_KEY is not set in environment variables");

        let url;
        if (pageUrl) {
            url = pageUrl;
        } else {
            url = `https://www.searchapi.io/api/v1/search?engine=amazon_search&amazon_domain=amazon.com&q=${encodeURIComponent(query)}&page=${page}&api_key=${apiKey}`;
        }
        const response = await fetch(url);
        const responseBody = await response.text();
        if (!response.ok) {
            console.error("[AMAZON SEARCH TOOL] API error", { status: response.status, body: responseBody });
            throw new Error(`Amazon search failed: ${response.statusText} - ${responseBody}`);
        }
        const data = JSON.parse(responseBody);
        console.log('[DEBUG] SearchApi.io data.pagination:', JSON.stringify(data.pagination, null, 2));

        // Map results to a simplified product structure
        const products = (data.organic_results || []).map((product: any) => ({
            title: product.title,
            url: product.link,
            image: product.thumbnail,
            price: product.price || null,
            currency: null, // price is a string like "$45.44"
            rating: product.rating || null,
            ratings_total: product.reviews || null,
            eta: product.fulfillment?.standard_delivery?.text || null,
            description: product.brand || "",
        }));

        return {
            products,
            page,
            perPage,
            totalResults: (data.organic_results || []).length,
            pagination: data.pagination || {},
        };
    },
}; 