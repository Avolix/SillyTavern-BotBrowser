import { default_avatar } from '../../../../../../script.js';

// SECURITY: the upstream `mia13165/updated_cards` repo is the carrier in the
// SillyTavern-BotBrowser backdoor (rentry.co/st-backdoor) — every fetched JSON
// field is rendered into the detail modal. Point this at a repo you control
// (a forked + audited copy of updated_cards). Fetches are skipped if it still
// resolves to mia13165's repo.
const baseUrl = 'https://raw.githubusercontent.com/Avolix/updated_cards/refs/heads/main';

const BLOCKED_HOSTS = ['mia13165/updated_cards'];

function isBlockedSource(url) {
    return BLOCKED_HOSTS.some(needle => url.includes(needle));
}

if (isBlockedSource(baseUrl)) {
    console.error('[Bot Browser] Refusing to load: baseUrl points at the known-malicious mia13165/updated_cards repo. Set baseUrl to a repo you control.');
}

// Storage for loaded data
const loadedData = {
    masterIndex: null,
    serviceIndexes: {},
    loadedChunks: {}
};

export async function loadMasterIndex() {
    if (isBlockedSource(baseUrl)) return null;
    try {
        const response = await fetch(`${baseUrl}/index/master-index.json`);
        if (!response.ok) throw new Error('Failed to load master index');
        loadedData.masterIndex = await response.json();
        return loadedData.masterIndex;
    } catch (error) {
        console.error('[Bot Browser] Error loading master index:', error);
        toastr.error('Failed to load bot browser data');
        return null;
    }
}

export async function loadServiceIndex(serviceName) {
    if (loadedData.serviceIndexes[serviceName]) {
        return loadedData.serviceIndexes[serviceName];
    }

    if (isBlockedSource(baseUrl)) {
        loadedData.serviceIndexes[serviceName] = [];
        return [];
    }
    try {
        const response = await fetch(`${baseUrl}/index/${serviceName}-search.json`);
        if (!response.ok) {
            console.warn(`[Bot Browser] ${serviceName} index not found (${response.status})`);
            loadedData.serviceIndexes[serviceName] = [];
            return [];
        }

        const text = await response.text();
        if (!text || text.trim().length === 0) {
            console.warn(`[Bot Browser] ${serviceName} index is empty`);
            loadedData.serviceIndexes[serviceName] = [];
            return [];
        }

        const data = JSON.parse(text);

        // Handle different data formats: object with cards/lorebooks array, or direct array
        const items = data.cards || data.lorebooks || data;
        if (!Array.isArray(items)) {
            throw new Error(`Invalid data format for ${serviceName}`);
        }

        loadedData.serviceIndexes[serviceName] = items;
        return items;
    } catch (error) {
        console.error(`[Bot Browser] Error loading ${serviceName} index:`, error);
        loadedData.serviceIndexes[serviceName] = [];
        return [];
    }
}

export async function loadCardChunk(service, chunkFile) {
    const chunkKey = `${service}/${chunkFile}`;
    if (loadedData.loadedChunks[chunkKey]) {
        return loadedData.loadedChunks[chunkKey];
    }

    if (isBlockedSource(baseUrl)) return [];
    try {
        const response = await fetch(`${baseUrl}/chunks/${service}/${chunkFile}`);
        if (!response.ok) throw new Error(`Failed to load chunk ${chunkKey}`);

        const parsedData = await response.json();

        let data;
        if (Array.isArray(parsedData)) {
            data = parsedData;
        } else if (parsedData.cards) {
            data = parsedData.cards;
        } else if (parsedData.lorebooks) {
            data = parsedData.lorebooks;
        } else {
            data = [parsedData];
        }

        loadedData.loadedChunks[chunkKey] = data;
        return data;
    } catch (error) {
        console.error(`[Bot Browser] Error loading chunk ${chunkKey}:`, error);
        return [];
    }
}

async function cacheService(serviceName) {
    const cards = await loadServiceIndex(serviceName);
    return cards;
}

function pickCard(cards) {
    const cardsWithChunks = cards.filter(card =>
        card.chunk &&
        (card.avatar_url || card.image_url)
    );

    if (cardsWithChunks.length > 0) {
        return cardsWithChunks[Math.floor(Math.random() * cardsWithChunks.length)];
    }

    return null;
}

function findDefaultAvatarCard(cards) {
    const cardsWithChunks = cards.filter(card =>
        card.chunk &&
        (card.avatar_url || card.image_url)
    );

    const avatarFilename = default_avatar.split('/').pop();

    for (const card of cardsWithChunks) {
        const imageUrl = card.image_url || card.avatar_url || '';
        if (imageUrl.includes(default_avatar) || imageUrl.endsWith(avatarFilename)) {
            card.image_url = default_avatar;
            return card;
        }
    }

    return null;
}

function cleanupModal() {
    const detailModal = document.getElementById('bot-browser-detail-modal');
    const detailOverlay = document.getElementById('bot-browser-detail-overlay');

    if (detailModal && detailOverlay) {
        detailModal.className = 'bot-browser-preload-container';
        detailOverlay.className = 'bot-browser-preload-container';

        return new Promise(resolve => {
            setTimeout(() => {
                detailModal.remove();
                detailOverlay.remove();
                resolve();
            }, 10);
        });
    }
}

export async function initializeServiceCache(showCardDetailFunc) {
    try {
        await loadMasterIndex();

        const allServices = ['character_tavern', 'catbox', 'webring', 'chub', 'anchorhold', 'risuai_realm', 'nyai_me', 'desuarchive', 'mlpchag'];
        let defaultAvatarCard = null;
        let cachedServices = {};

        for (const serviceName of allServices) {
            const cards = await cacheService(serviceName);
            cachedServices[serviceName] = cards;

            if (cards.length > 0) {
                defaultAvatarCard = findDefaultAvatarCard(cards);

                if (defaultAvatarCard) {
                    break;
                }
            }
        }

        if (defaultAvatarCard) {
            await showCardDetailFunc(defaultAvatarCard, false);
            await cleanupModal();
        }

        const fetchedServiceNames = Object.keys(cachedServices).filter(s => cachedServices[s].length > 0);
        if (fetchedServiceNames.length > 0) {
            const randomServiceName = fetchedServiceNames[Math.floor(Math.random() * fetchedServiceNames.length)];
            const cards = cachedServices[randomServiceName];
            const randomCard = pickCard(cards);

            if (randomCard) {
                await showCardDetailFunc(randomCard, false);
                await cleanupModal();
            }
        }
    } catch (error) {
        console.error('[Bot Browser] Service cache initialization failed:', error);
    }
}

// Export loaded data for other modules
export function getMasterIndex() {
    return loadedData.masterIndex;
}

export function getServiceIndex(serviceName) {
    return loadedData.serviceIndexes[serviceName];
}

export function getLoadedChunk(service, chunkFile) {
    const chunkKey = `${service}/${chunkFile}`;
    return loadedData.loadedChunks[chunkKey];
}
