export function getAllTags(cards) {
    const tagsSet = new Set();
    cards.forEach(card => {
        if (Array.isArray(card.tags)) {
            card.tags.forEach(tag => tagsSet.add(tag));
        }
    });
    return Array.from(tagsSet).sort();
}

// Get all unique creators from cards
export function getAllCreators(cards) {
    const creatorsSet = new Set();
    cards.forEach(card => {
        if (card.creator) {
            creatorsSet.add(card.creator);
        }
    });
    return Array.from(creatorsSet).sort();
}

// Sort cards based on current sort option
export function sortCards(cards, sortBy) {
    const sorted = [...cards]; // Create a copy to avoid mutating original

    switch (sortBy) {
        case 'name_asc':
            return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        case 'name_desc':
            return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        case 'creator_asc':
            return sorted.sort((a, b) => (a.creator || '').localeCompare(b.creator || ''));
        case 'creator_desc':
            return sorted.sort((a, b) => (b.creator || '').localeCompare(a.creator || ''));
        // Chub API sort options - cards already sorted by API, preserve order
        case 'recent':
        case 'trending':
        case 'rating':
        case 'stars':
        case 'downloads':
        case 'favorites':
        case 'newcomer':
        case 'activity':
        case 'default':
            // These are API-level sorts - cards come pre-sorted from API
            // For non-Chub sources, fall back to keeping original order
            return sorted;
        case 'relevance':
        default:
            // If using search, Fuse.js already sorted by relevance
            // Otherwise, keep original order
            return sorted;
    }
}

// Get all available sort options
export function getAllSortOptions(isChubSource = false) {
    const baseOptions = [
        { value: 'relevance', label: 'Relevance' },
        { value: 'name_asc', label: 'Name (A-Z)' },
        { value: 'name_desc', label: 'Name (Z-A)' },
        { value: 'creator_asc', label: 'Creator (A-Z)' },
        { value: 'creator_desc', label: 'Creator (Z-A)' }
    ];

    if (isChubSource) {
        // Add Chub-specific API sort options
        return [
            ...baseOptions,
            { value: 'recent', label: '🕐 Recent' },
            { value: 'trending', label: '🔥 Trending' },
            { value: 'rating', label: '⭐ Top Rated' },
            { value: 'stars', label: '✨ Most Stars' },
            { value: 'downloads', label: '📥 Most Downloads' },
            { value: 'favorites', label: '❤️ Most Favorites' },
            { value: 'newcomer', label: '🆕 Newcomers' },
            { value: 'activity', label: '📅 Recently Active' }
        ];
    }

    return baseOptions;
}

// Check if a sort option requires API-level sorting (Chub only)
export function isApiLevelSort(sortBy) {
    const apiSorts = ['recent', 'trending', 'rating', 'stars', 'downloads', 'favorites', 'newcomer', 'activity', 'default'];
    return apiSorts.includes(sortBy);
}

// Filter cards based on current filter state
export function filterCards(cards, filters, fuse, extensionName, extension_settings) {
    let filteredCards = cards;

    // Text search using Fuse.js for fuzzy matching
    if (filters.search && fuse) {
        const searchResults = fuse.search(filters.search);
        // Extract the items from Fuse results (Fuse returns objects with { item, score, matches })
        filteredCards = searchResults.map(result => result.item);
    }

    // Apply additional filters (tags, creator, and NSFW)
    filteredCards = filteredCards.filter(card => {
        // Tag filter (must have ALL selected tags)
        if (filters.tags.length > 0) {
            if (!card.tags || !filters.tags.every(tag => card.tags.includes(tag))) {
                return false;
            }
        }

        // Creator filter
        if (filters.creator && card.creator !== filters.creator) {
            return false;
        }

        // NSFW filter - hide NSFW cards if hideNsfw is enabled
        if (extension_settings[extensionName].hideNsfw && card.possibleNsfw) {
            return false;
        }

        // Tag blocklist filter - hide cards with blocked tags or terms in description
        const blocklist = extension_settings[extensionName].tagBlocklist || [];
        if (blocklist.length > 0) {
            // Normalize blocklist terms (lowercase, trim)
            const normalizedBlocklist = blocklist.map(term => term.toLowerCase().trim()).filter(term => term.length > 0);

            if (normalizedBlocklist.length > 0) {
                // Check if card has any blocked tags
                if (card.tags && Array.isArray(card.tags)) {
                    const normalizedTags = card.tags.map(tag => tag.toLowerCase().trim());
                    if (normalizedBlocklist.some(blocked => normalizedTags.includes(blocked))) {
                        return false;
                    }
                }

                // Check if description contains any blocked terms
                const desc = (card.desc_search || card.desc_preview || card.description || '').toLowerCase();
                if (normalizedBlocklist.some(blocked => desc.includes(blocked))) {
                    return false;
                }

                // Check if name contains any blocked terms
                const name = (card.name || '').toLowerCase();
                if (normalizedBlocklist.some(blocked => name.includes(blocked))) {
                    return false;
                }
            }
        }

        return true;
    });

    return filteredCards;
}

export function deduplicateCards(cards) {
    const seen = new Map(); // Use Map to track first occurrence
    const deduplicated = [];

    for (const card of cards) {
        // Normalize name (lowercase and trim whitespace)
        const normalizedName = (card.name || '').toLowerCase().trim();
        const normalizedCreator = (card.creator || 'unknown').toLowerCase().trim();

        // Create a unique key using normalized name and creator
        const key = `${normalizedName}|${normalizedCreator}`;

        if (seen.has(key)) {
            const firstCard = seen.get(key);
            console.log('[Bot Browser] Removing duplicate card:', card.name, 'from', card.service,
                       '(keeping first occurrence from', firstCard.service, ')');
        } else {
            // First occurrence - keep it and track it
            seen.set(key, card);
            deduplicated.push(card);
        }
    }

    const removedCount = cards.length - deduplicated.length;
    if (removedCount > 0) {
        console.log(`[Bot Browser] Removed ${removedCount} duplicate cards, kept ${deduplicated.length} unique cards`);
    }

    return deduplicated;
}

// Validate and show fallback for cards with failed image loads
export function validateCardImages() {
    const cardThumbnails = document.querySelectorAll('.bot-browser-card-thumbnail');
    let failedCount = 0;

    cardThumbnails.forEach(cardEl => {
        const imageDiv = cardEl.querySelector('.bot-browser-card-image');
        const bgImage = imageDiv.style.backgroundImage;

        if (bgImage && bgImage !== 'none') {
            // Extract URL from background-image style
            const urlMatch = bgImage.match(/url\(["']?(.+?)["']?\)/);
            if (urlMatch && urlMatch[1]) {
                const imageUrl = urlMatch[1];

                // Use an actual Image object to test loading instead of fetch (avoids CORS issues)
                const testImg = new Image();

                testImg.onerror = () => {
                    // Image actually failed to load, try to get error code
                    fetch(imageUrl, { method: 'HEAD' })
                        .then(response => {
                            const errorCode = response.ok ? 'Unknown Error' : `Error ${response.status}`;
                            showImageError(imageDiv, errorCode, imageUrl);
                        })
                        .catch(() => {
                            showImageError(imageDiv, 'Network Error', imageUrl);
                        });

                    failedCount++;
                };

                testImg.src = imageUrl;
            }
        }
    });
}

// Helper function to show image error
function showImageError(imageDiv, errorCode, imageUrl) {
    imageDiv.style.backgroundImage = 'none';
    imageDiv.classList.add('image-load-failed');

    if (!imageDiv.querySelector('.image-failed-text')) {
        imageDiv.innerHTML = `
            <div class="image-failed-text">
                <i class="fa-solid fa-image-slash"></i>
                <span>Image Failed to Load</span>
                <span class="error-code">${errorCode}</span>
            </div>
        `;
    }

    console.log(`[Bot Browser] Showing fallback for card with failed image (${errorCode}):`, imageUrl);
}

export async function getRandomCard(source, currentCards, loadServiceIndexFunc) {
    try {
        let cards = [];

        if (source === 'current' && currentCards.length > 0) {
            // Random from current view
            cards = currentCards.filter(card => {
                const imageUrl = card.avatar_url || card.image_url;
                return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
            });
        } else if (source === 'all' || !source) {
            // Random from all sources
            toastr.info('Loading all cards...', '', { timeOut: 1500 });
            const serviceNames = ['anchorhold', 'catbox', 'character_tavern', 'chub', 'nyai_me', 'risuai_realm', 'webring', 'mlpchag', 'desuarchive'];

            for (const service of serviceNames) {
                const serviceCards = await loadServiceIndexFunc(service);
                const cardsWithSource = serviceCards.map(card => ({
                    ...card,
                    sourceService: service
                })).filter(card => {
                    const imageUrl = card.avatar_url || card.image_url;
                    return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
                });
                cards = cards.concat(cardsWithSource);
            }
        } else {
            // Random from specific service
            cards = currentCards.filter(card => {
                const imageUrl = card.avatar_url || card.image_url;
                return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
            });
        }

        if (cards.length === 0) {
            toastr.warning('No cards available');
            return null;
        }

        // Pick random
        const randomIndex = Math.floor(Math.random() * cards.length);
        const randomCard = cards[randomIndex];

        console.log('[Bot Browser] Selected random card:', randomCard.name);
        return randomCard;
    } catch (error) {
        console.error('[Bot Browser] Error getting random card:', error);
        toastr.error('Failed to get random card');
        return null;
    }
}
