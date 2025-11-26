/**
 * Chub API Service
 * Fetches cards directly from Chub's API with sorting support
 */

const CHUB_API_BASE = 'https://api.chub.ai';

// Map our sort options to Chub API sort parameters
const SORT_MAP = {
    'recent': 'created_at',
    'trending': 'trending',
    'rating': 'rating',
    'stars': 'star_count',
    'downloads': 'download_count',
    'favorites': 'n_favorites',
    'newcomer': 'newcomer',
    'activity': 'last_activity_at',
    'default': 'default'
};

/**
 * Fetch cards from Chub API with sorting
 * @param {Object} options - Fetch options
 * @param {string} options.sort - Sort type (recent, trending, rating, stars, etc.)
 * @param {number} options.first - Number of results to fetch (default 200)
 * @param {string} options.search - Search query (optional)
 * @param {string} options.cursor - Pagination cursor (optional)
 * @param {boolean} options.nsfw - Include NSFW content (default true)
 * @returns {Promise<{cards: Array, cursor: string|null, count: number}>}
 */
export async function fetchChubCards(options = {}) {
    const {
        sort = 'default',
        first = 200,
        search = '',
        cursor = null,
        nsfw = true
    } = options;

    try {
        // Build query parameters
        const params = new URLSearchParams();
        params.append('first', first.toString());
        
        // Map our sort option to Chub API sort parameter
        const apiSort = SORT_MAP[sort] || SORT_MAP['default'];
        params.append('sort', apiSort);
        
        if (search) {
            params.append('search', search);
        }
        
        if (cursor) {
            params.append('cursor', cursor);
        }

        // NSFW filter (venus=true includes NSFW, venus=false excludes)
        if (!nsfw) {
            params.append('venus', 'false');
        }

        const url = `${CHUB_API_BASE}/search?${params.toString()}`;
        console.log('[Bot Browser] Fetching from Chub API:', url);

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Chub API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.data || !Array.isArray(data.data.nodes)) {
            throw new Error('Invalid response format from Chub API');
        }

        // Transform Chub API response to match our card format
        const cards = data.data.nodes.map(node => transformChubCard(node));

        return {
            cards,
            cursor: data.data.cursor || null,
            count: data.data.count || cards.length
        };
    } catch (error) {
        console.error('[Bot Browser] Error fetching from Chub API:', error);
        throw error;
    }
}

/**
 * Transform a Chub API card to our internal card format
 * @param {Object} node - Raw card data from Chub API
 * @returns {Object} - Transformed card matching our format
 */
function transformChubCard(node) {
    // Detect NSFW from topics/tags
    const nsfwKeywords = ['nsfw', 'nsfl', 'adult', 'explicit', 'mature', 'erotic', 'sex', 'porn'];
    const topics = node.topics || [];
    const topicsLower = topics.map(t => t.toLowerCase());
    const possibleNsfw = topicsLower.some(t => nsfwKeywords.some(kw => t.includes(kw)));

    return {
        id: node.fullPath ? `https://chub.ai/characters/${node.fullPath}` : `chub-${node.id}`,
        service: 'chub',
        name: node.name || 'Unknown',
        desc_preview: node.tagline || node.description?.substring(0, 150) || '',
        desc_search: node.description || '',
        tags: topics,
        creator: node.fullPath ? node.fullPath.split('/')[0] : 'Unknown',
        image_url: `https://chub.ai/characters/${node.fullPath}`,
        avatar_url: node.avatar_url || node.max_res_url || '',
        possibleNsfw: possibleNsfw || node.nsfw_image || false,
        // Additional metadata from API (useful for display)
        _chubMeta: {
            starCount: node.starCount || 0,
            rating: node.rating || 0,
            ratingCount: node.ratingCount || 0,
            createdAt: node.createdAt || null,
            lastActivityAt: node.lastActivityAt || null,
            nChats: node.nChats || 0,
            nMessages: node.nMessages || 0,
            nFavorites: node.n_favorites || 0,
            forksCount: node.forksCount || 0,
            nTokens: node.nTokens || 0
        },
        // For compatibility with existing code
        chunk: null,
        chunk_idx: 0,
        sourceService: 'chub'
    };
}

/**
 * Get available sort options for Chub
 * @returns {Array<{value: string, label: string}>}
 */
export function getChubSortOptions() {
    return [
        { value: 'default', label: 'Default' },
        { value: 'recent', label: 'Recent' },
        { value: 'trending', label: 'Trending' },
        { value: 'rating', label: 'Top Rated' },
        { value: 'stars', label: 'Most Stars' },
        { value: 'downloads', label: 'Most Downloads' },
        { value: 'favorites', label: 'Most Favorites' },
        { value: 'newcomer', label: 'Newcomers' },
        { value: 'activity', label: 'Recently Active' }
    ];
}

/**
 * Check if a sort option is a Chub API sort (vs local sort)
 * @param {string} sortBy - Sort option
 * @returns {boolean}
 */
export function isChubApiSort(sortBy) {
    return Object.keys(SORT_MAP).includes(sortBy);
}
