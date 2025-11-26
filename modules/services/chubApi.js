/**
 * Chub API Service
 * Fetches cards directly from Chub's API with sorting and authentication support
 */

const CHUB_API_BASE = 'https://api.chub.ai';

// Storage key for Chub API token
const CHUB_TOKEN_KEY = 'botBrowser_chubApiToken';

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
        
        // Build request headers
        const headers = {
            'Accept': 'application/json',
        };
        
        // Add authentication token if available
        // Chub uses CH-API-KEY header for API key authentication
        const token = getChubToken();
        if (token) {
            // Try CH-API-KEY header (Chub's API key format)
            headers['CH-API-KEY'] = token;
            // Also try Authorization header as fallback
            headers['Authorization'] = `Bearer ${token}`;
            console.log('[Bot Browser] Fetching from Chub API (authenticated):', url);
        } else {
            console.log('[Bot Browser] Fetching from Chub API (anonymous):', url);
        }

        const response = await fetch(url, { headers });
        
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

/**
 * Save Chub API token to local storage
 * @param {string} token - The API token
 */
export function saveChubToken(token) {
    if (token && token.trim()) {
        localStorage.setItem(CHUB_TOKEN_KEY, token.trim());
        console.log('[Bot Browser] Chub API token saved');
    } else {
        localStorage.removeItem(CHUB_TOKEN_KEY);
        console.log('[Bot Browser] Chub API token removed');
    }
}

/**
 * Get Chub API token from local storage
 * @returns {string|null} - The stored token or null
 */
export function getChubToken() {
    return localStorage.getItem(CHUB_TOKEN_KEY);
}

/**
 * Check if Chub API token is set
 * @returns {boolean}
 */
export function hasChubToken() {
    const token = getChubToken();
    return token !== null && token.trim().length > 0;
}

/**
 * Clear Chub API token
 */
export function clearChubToken() {
    localStorage.removeItem(CHUB_TOKEN_KEY);
    console.log('[Bot Browser] Chub API token cleared');
}
