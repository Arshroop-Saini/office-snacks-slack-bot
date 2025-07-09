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
    execute: async ({ query, page = 1, perPage = 5 }: { query: string; page?: number; perPage?: number }) => {
        const apiKey = process.env.SEARCH_API_KEY;
        if (!apiKey) throw new Error("SEARCH_API_KEY is not set in environment variables");

        const url = `https://www.searchapi.io/api/v1/search?engine=amazon&amazon_domain=amazon.com&q=${encodeURIComponent(query)}&page=${page}&api_key=${apiKey}`;
        const response = await fetch(url);
        const responseBody = await response.text();
        if (!response.ok) {
            console.error("[AMAZON SEARCH TOOL] API error", { status: response.status, body: responseBody });
            throw new Error(`Amazon search failed: ${response.statusText} - ${responseBody}`);
        }
        const data = JSON.parse(responseBody);

        // Map results to a simplified product structure
        const products = (data.products || []).slice(0, perPage).map((product: any) => ({
            title: product.title,
            url: product.url,
            image: product.image,
            price: product.price?.raw || product.price?.value || null,
            currency: product.price?.currency || null,
            rating: product.rating || null,
            ratings_total: product.ratings_total || null,
            eta: product.delivery_info?.estimated_delivery_date || null,
            description: product.description || null,
        }));

        return {
            products,
            page,
            perPage,
            totalResults: data.total_results || products.length,
            hasNextPage: products.length === perPage,
        };
    },
}; 