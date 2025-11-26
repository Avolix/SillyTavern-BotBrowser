import { Fuse } from '../../../../../lib.js';
import { debounce, escapeHTML } from './utils/utils.js';
import { createBrowserHeader, createCardGrid, createCardHTML, createBottomActions } from './templates/templates.js';
import { getAllTags, getAllCreators, filterCards, sortCards, deduplicateCards, validateCardImages, isApiLevelSort } from './services/cards.js';
import { loadPersistentSearch, savePersistentSearch, loadSearchCollapsed, saveSearchCollapsed } from './storage/storage.js';
import { fetchChubCards } from './services/chubApi.js';

export function createCardBrowser(serviceName, cards, state, extensionName, extension_settings, showCardDetailFunc) {
    state.view = 'browser';
    state.currentService = serviceName;

    // Deduplicate cards before storing, and preserve or add the source service name
    const cardsWithSource = cards.map(card => ({
        ...card,
        sourceService: card.sourceService || serviceName
    }));
    state.currentCards = deduplicateCards(cardsWithSource);

    // Load persistent search for this service if this is the first time opening
    if (!state.filters.search && !state.filters.tags.length && !state.filters.creator) {
        const savedSearch = loadPersistentSearch(extensionName, extension_settings, serviceName);
        if (savedSearch) {
            state.filters = savedSearch.filters || { search: '', tags: [], creator: '' };
            state.sortBy = savedSearch.sortBy || extension_settings[extensionName].defaultSortBy || 'relevance';
        }
    }

    // Initialize Fuse.js for fuzzy search
    const fuseOptions = {
        keys: [
            { name: 'name', weight: 3 },
            { name: 'creator', weight: 2 },
            { name: 'desc_search', weight: 1.5 },
            { name: 'desc_preview', weight: 1 },
            { name: 'tags', weight: 1.5 }
        ],
        threshold: extension_settings[extensionName].fuzzySearchThreshold || 0.4,
        distance: 100,
        minMatchCharLength: 2,
        ignoreLocation: true,
        useExtendedSearch: true
    };
    state.fuse = new Fuse(state.currentCards, fuseOptions);

    const menu = document.getElementById('bot-browser-menu');
    if (!menu) return;

    const allTags = getAllTags(state.currentCards);
    const allCreators = getAllCreators(state.currentCards);
    const filteredCards = filterCards(state.currentCards, state.filters, state.fuse, extensionName, extension_settings);
    filteredCards.forEach((card, index) => {
        card.sortedIndex = index;
    });
    const sortedCards = sortCards(filteredCards, state.sortBy);

    const cardsWithImages = sortedCards.filter(card => {
        const imageUrl = card.avatar_url || card.image_url;
        return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
    });

    // Store filtered cards for pagination
    state.filteredCards = cardsWithImages;
    state.currentPage = 1;
    state.totalPages = Math.ceil(cardsWithImages.length / (extension_settings[extensionName].cardsPerPage || 200));

    const serviceDisplayName = serviceName === 'all' ? 'All Sources' :
        serviceName === 'anchorhold' ? '4chan - /aicg/' :
            serviceName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Load collapsed state before creating HTML to prevent animation
    const searchCollapsed = loadSearchCollapsed();

    // Replace menu content
    const menuContent = menu.querySelector('.bot-browser-content');
    const hideNsfw = extension_settings[extensionName].hideNsfw || false;
    const nsfwText = hideNsfw ? ' (after hiding NSFW)' : '';
    const cardCountText = `${cardsWithImages.length} card${cardsWithImages.length !== 1 ? 's' : ''} found${nsfwText}`;
    const isChubSource = serviceName === 'chub';
    console.log('[Bot Browser] Creating browser header - serviceName:', serviceName, 'isChubSource:', isChubSource, 'currentSort:', state.sortBy);
    menuContent.innerHTML = createBrowserHeader(serviceDisplayName, state.filters.search, cardCountText, searchCollapsed, hideNsfw, isChubSource, state.sortBy);

    // Update filter dropdowns
    updateFilterDropdowns(menuContent, allTags, allCreators, state);

    // Render first page
    renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);

    // Add event listeners
    setupBrowserEventListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc);

    console.log('[Bot Browser] Card browser created with', sortedCards.length, 'cards');
}

// Update filter dropdowns
function updateFilterDropdowns(menuContent, allTags, allCreators, state) {
    // Populate tags (Custom Multi-Select)
    const tagFilterContainer = menuContent.querySelector('#bot-browser-tag-filter');

    const tagOptionsContainer = tagFilterContainer.querySelector('.bot-browser-multi-select-options');
    const tagTriggerText = tagFilterContainer.querySelector('.selected-text');

    // Clear existing options
    tagOptionsContainer.innerHTML = '';

    // Add "All Tags" option (clear all)
    const allTagsOption = document.createElement('div');
    allTagsOption.className = `bot-browser-multi-select-option ${state.filters.tags.length === 0 ? 'selected' : ''}`;
    allTagsOption.dataset.value = '';
    allTagsOption.innerHTML = `<i class="fa-solid fa-check"></i> <span>All Tags</span>`;
    tagOptionsContainer.appendChild(allTagsOption);

    // Add tag options
    allTags.forEach(tag => {
        const isSelected = state.filters.tags.includes(tag);
        const option = document.createElement('div');
        option.className = `bot-browser-multi-select-option ${isSelected ? 'selected' : ''}`;
        option.dataset.value = tag;
        option.innerHTML = `<i class="fa-solid fa-check"></i> <span>${escapeHTML(tag)}</span>`;
        tagOptionsContainer.appendChild(option);
    });

    // Update trigger text
    if (state.filters.tags.length === 0) {
        tagTriggerText.textContent = 'All Tags';
    } else if (state.filters.tags.length === 1) {
        tagTriggerText.textContent = state.filters.tags[0];
    } else {
        tagTriggerText.textContent = `${state.filters.tags.length} Tags Selected`;
    }

    // Populate creators (Custom Multi-Select)
    const creatorFilterContainer = menuContent.querySelector('#bot-browser-creator-filter');
    const creatorOptionsContainer = creatorFilterContainer.querySelector('.bot-browser-multi-select-options');
    const creatorTriggerText = creatorFilterContainer.querySelector('.selected-text');

    // Clear existing options
    creatorOptionsContainer.innerHTML = '';

    // Add "All Creators" option (clear all)
    const allCreatorsOption = document.createElement('div');
    allCreatorsOption.className = `bot-browser-multi-select-option ${!state.filters.creator ? 'selected' : ''}`;
    allCreatorsOption.dataset.value = '';
    allCreatorsOption.innerHTML = `<i class="fa-solid fa-check"></i> <span>All Creators</span>`;
    creatorOptionsContainer.appendChild(allCreatorsOption);

    // Add creator options
    allCreators.forEach(creator => {
        const isSelected = state.filters.creator === creator;
        const option = document.createElement('div');
        option.className = `bot-browser-multi-select-option ${isSelected ? 'selected' : ''}`;
        option.dataset.value = creator;
        option.innerHTML = `<i class="fa-solid fa-check"></i> <span>${escapeHTML(creator)}</span>`;
        creatorOptionsContainer.appendChild(option);
    });

    // Update trigger text
    if (!state.filters.creator) {
        creatorTriggerText.textContent = 'All Creators';
    } else {
        creatorTriggerText.textContent = state.filters.creator;
    }

    // Update sort filter initial state
    const sortFilterContainer = menuContent.querySelector('#bot-browser-sort-filter');
    if (sortFilterContainer) {
        const sortTriggerText = sortFilterContainer.querySelector('.selected-text');
        const sortOptions = sortFilterContainer.querySelectorAll('.bot-browser-multi-select-option');

        const sortLabels = {
            'relevance': 'Relevance',
            'name_asc': 'Name (A-Z)',
            'name_desc': 'Name (Z-A)',
            'creator_asc': 'Creator (A-Z)',
            'creator_desc': 'Creator (Z-A)'
        };

        if (sortTriggerText) {
            sortTriggerText.textContent = sortLabels[state.sortBy] || 'Relevance';
        }

        sortOptions.forEach(option => {
            const value = option.dataset.value;
            if (state.sortBy === value) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    // Filter out tags that don't exist in the current service (cleanup)
    const validTags = state.filters.tags.filter(tag => allTags.includes(tag));
    if (validTags.length !== state.filters.tags.length) {
        state.filters.tags = validTags;
        // Re-run update to fix UI if tags were removed
        updateFilterDropdowns(menuContent, allTags, allCreators, state);
    }
}

function setupBrowserEventListeners(menuContent, state, extensionName, extension_settings, showCardDetailFunc) {
    const backButton = menuContent.querySelector('.bot-browser-back-button');
    backButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // navigateToSources will be called from main index.js
        window.dispatchEvent(new CustomEvent('bot-browser-navigate-sources'));
    });

    const closeButton = menuContent.querySelector('.bot-browser-close');
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // closeBotBrowserMenu will be called from main index.js
        window.dispatchEvent(new CustomEvent('bot-browser-close'));
    });

    // Global click listener for closing dropdowns
    const closeDropdowns = (e) => {
        // Check if menu content still exists in DOM
        if (!document.body.contains(menuContent)) {
            document.removeEventListener('click', closeDropdowns);
            return;
        }

        // Check if click is outside all dropdowns
        const dropdowns = menuContent.querySelectorAll('.bot-browser-multi-select');
        dropdowns.forEach(container => {
            const dropdown = container.querySelector('.bot-browser-multi-select-dropdown');
            // Close if click is outside the container
            if (!container.contains(e.target) && dropdown) {
                dropdown.classList.remove('open');
            }
        });
    };

    // Use capture phase to ensure this fires before other handlers
    document.addEventListener('click', closeDropdowns, true);

    const searchInput = menuContent.querySelector('.bot-browser-search-input');
    searchInput.addEventListener('input', debounce((e) => {
        state.filters.search = e.target.value;
        savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy);
        refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);
    }, 300));

    // Custom Tag Filter Logic
    setupCustomDropdown(
        menuContent.querySelector('#bot-browser-tag-filter'),
        state,
        'tags',
        extensionName,
        extension_settings,
        showCardDetailFunc
    );

    // Custom Creator Filter Logic
    setupCustomDropdown(
        menuContent.querySelector('#bot-browser-creator-filter'),
        state,
        'creator',
        extensionName,
        extension_settings,
        showCardDetailFunc
    );

    // Custom Sort Filter Logic
    setupCustomDropdown(
        menuContent.querySelector('#bot-browser-sort-filter'),
        state,
        'sort',
        extensionName,
        extension_settings,
        showCardDetailFunc
    );

    const clearButton = menuContent.querySelector('.bot-browser-clear-filters');
    clearButton.addEventListener('click', () => {
        state.filters = { search: '', tags: [], creator: '' };
        state.sortBy = 'relevance';
        searchInput.value = '';

        // Reset custom tag filter
        const tagTriggerText = menuContent.querySelector('#bot-browser-tag-filter .selected-text');
        if (tagTriggerText) tagTriggerText.textContent = 'All Tags';

        // Reset custom creator filter
        const creatorTriggerText = menuContent.querySelector('#bot-browser-creator-filter .selected-text');
        if (creatorTriggerText) creatorTriggerText.textContent = 'All Creators';

        // Reset custom sort filter
        const sortTriggerText = menuContent.querySelector('#bot-browser-sort-filter .selected-text');
        if (sortTriggerText) sortTriggerText.textContent = 'Relevance';

        savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy);
        refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);
    });
    // Toggle search section
    const toggleSearchButton = menuContent.querySelector('.bot-browser-toggle-search');
    const searchSection = document.getElementById('bot-browser-search-section');

    // Initialize state from current DOM (already set by template)
    state.searchCollapsed = searchSection.classList.contains('collapsed');

    toggleSearchButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        state.searchCollapsed = !state.searchCollapsed;
        saveSearchCollapsed(state.searchCollapsed);

        if (state.searchCollapsed) {
            searchSection.classList.add('collapsed');
            toggleSearchButton.querySelector('i').classList.remove('fa-chevron-up');
            toggleSearchButton.querySelector('i').classList.add('fa-chevron-down');
        } else {
            searchSection.classList.remove('collapsed');
            toggleSearchButton.querySelector('i').classList.remove('fa-chevron-down');
            toggleSearchButton.querySelector('i').classList.add('fa-chevron-up');
        }
    });
}

function setupCustomDropdown(container, state, filterType, extensionName, extension_settings, showCardDetailFunc) {
    if (!container) return;

    const trigger = container.querySelector('.bot-browser-multi-select-trigger');
    const dropdown = container.querySelector('.bot-browser-multi-select-dropdown');
    const searchInput = container.querySelector('.bot-browser-multi-select-search input');
    const optionsContainer = container.querySelector('.bot-browser-multi-select-options');

    // Sort dropdown doesn't have search
    const hasSearch = searchInput !== null;

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');

        // Close all other dropdowns
        document.querySelectorAll('.bot-browser-multi-select-dropdown').forEach(d => {
            if (d !== dropdown) d.classList.remove('open');
        });

        if (!isOpen) {
            dropdown.classList.add('open');
            if (hasSearch && searchInput) {
                searchInput.focus();
            }
        } else {
            dropdown.classList.remove('open');
        }
    });

    // Search functionality (only for dropdowns with search)
    if (hasSearch && searchInput) {
        // Prevent dropdown from closing when clicking on search input
        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Search functionality
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const options = optionsContainer.querySelectorAll('.bot-browser-multi-select-option');

            options.forEach(option => {
                const text = option.querySelector('span').textContent.toLowerCase();
                if (text.includes(query) || option.dataset.value === '') {
                    option.style.display = 'flex';
                } else {
                    option.style.display = 'none';
                }
            });
        });
    }

    // Option Selection
    optionsContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        const option = e.target.closest('.bot-browser-multi-select-option');
        if (!option) return;

        const value = option.dataset.value;

        if (filterType === 'tags') {
            if (value === '') {
                // Clear all tags
                state.filters.tags = [];
            } else {
                // Toggle tag selection
                if (state.filters.tags.includes(value)) {
                    state.filters.tags = state.filters.tags.filter(t => t !== value);
                } else {
                    state.filters.tags.push(value);
                }
            }

            // Save and refresh
            savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy);
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);

            // Keep dropdown open for multi-select
            // The updateFilterUI function will handle updating the selected states
        } else if (filterType === 'creator') {
            state.filters.creator = value;

            // Save and refresh
            savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy);
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);

            // Close dropdown for single select
            dropdown.classList.remove('open');
        } else if (filterType === 'sort') {
            state.sortBy = value;

            // Save and refresh
            savePersistentSearch(extensionName, extension_settings, state.currentService, state.filters, state.sortBy);
            refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc);

            // Close dropdown for single select
            dropdown.classList.remove('open');
        }
    });
}




function renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const gridContainer = menuContent.querySelector('.bot-browser-card-grid');
    if (!gridContainer) return;

    const cardsPerPage = extension_settings[extensionName].cardsPerPage || 200;

    // Calculate which cards to show
    const startIndex = (state.currentPage - 1) * cardsPerPage;
    const endIndex = startIndex + cardsPerPage;
    const pageCards = state.filteredCards.slice(startIndex, endIndex);

    // Create HTML for page cards
    const cardsHTML = pageCards.map(card => createCardHTML(card)).join('');

    // Create pagination HTML
    const paginationHTML = createPaginationHTML(state.currentPage, state.totalPages);

    // Set grid content
    gridContainer.innerHTML = cardsHTML + paginationHTML;

    // Attach card click listeners
    gridContainer.querySelectorAll('.bot-browser-card-thumbnail').forEach(cardEl => {
        cardEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const cardId = cardEl.dataset.cardId;
            const card = state.currentCards.find(c => c.id === cardId);
            if (card) {
                await showCardDetailFunc(card);
            }
        });
    });

    // Attach pagination listeners
    setupPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings);

    // Force scroll to top - gridContainer is the scrolling element
    gridContainer.scrollTop = 0;

    // Validate images
    setTimeout(() => validateCardImages(), 100);

    console.log(`[Bot Browser] Rendered page ${state.currentPage}/${state.totalPages} (${pageCards.length} cards)`);
}

function createPaginationHTML(currentPage, totalPages) {
    if (totalPages <= 1) return '';

    return `
        <div class="bot-browser-pagination">
            <button class="bot-browser-pagination-btn" data-action="first" ${currentPage === 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-angles-left"></i>
            </button>
            <button class="bot-browser-pagination-btn" data-action="prev" ${currentPage === 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-angle-left"></i>
            </button>
            <span class="bot-browser-pagination-info">
                <input type="number" class="bot-browser-pagination-input" min="1" max="${totalPages}" value="${currentPage}">
                <span>/ ${totalPages}</span>
            </span>
            <button class="bot-browser-pagination-btn" data-action="next" ${currentPage === totalPages ? 'disabled' : ''}>
                <i class="fa-solid fa-angle-right"></i>
            </button>
            <button class="bot-browser-pagination-btn" data-action="last" ${currentPage === totalPages ? 'disabled' : ''}>
                <i class="fa-solid fa-angles-right"></i>
            </button>
        </div>
    `;
}

function setupPaginationListeners(gridContainer, state, menuContent, showCardDetailFunc, extensionName, extension_settings) {
    const pagination = gridContainer.querySelector('.bot-browser-pagination');
    if (!pagination) return;

    // Button clicks
    pagination.querySelectorAll('.bot-browser-pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;

            switch (action) {
                case 'first':
                    state.currentPage = 1;
                    break;
                case 'prev':
                    state.currentPage = Math.max(1, state.currentPage - 1);
                    break;
                case 'next':
                    state.currentPage = Math.min(state.totalPages, state.currentPage + 1);
                    break;
                case 'last':
                    state.currentPage = state.totalPages;
                    break;
            }

            renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
        });
    });

    // Direct page input
    const pageInput = pagination.querySelector('.bot-browser-pagination-input');
    if (pageInput) {
        pageInput.addEventListener('change', (e) => {
            let page = parseInt(e.target.value);
            if (isNaN(page)) page = 1;
            page = Math.max(1, Math.min(state.totalPages, page));
            state.currentPage = page;
            renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
        });

        pageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });
    }
}

export function refreshCardGrid(state, extensionName, extension_settings, showCardDetailFunc) {
    const filteredCards = filterCards(state.currentCards, state.filters, state.fuse, extensionName, extension_settings);
    const sortedCards = sortCards(filteredCards, state.sortBy);
    const cardsWithImages = sortedCards.filter(card => {
        const imageUrl = card.avatar_url || card.image_url;
        return imageUrl && imageUrl.trim().length > 0 && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'));
    });

    // Store filtered cards and reset to page 1
    state.filteredCards = cardsWithImages;
    state.currentPage = 1;
    state.totalPages = Math.ceil(cardsWithImages.length / (extension_settings[extensionName].cardsPerPage || 200));

    const menuContent = document.querySelector('.bot-browser-content');
    const countContainer = document.querySelector('.bot-browser-results-count');

    // Update filter UI to reflect current selections
    updateFilterUI(menuContent, state);

    if (menuContent) {
        renderPage(state, menuContent, showCardDetailFunc, extensionName, extension_settings);
    }

    if (countContainer) {
        const hideNsfw = extension_settings[extensionName].hideNsfw || false;
        const nsfwText = hideNsfw ? ' (after hiding NSFW)' : '';
        countContainer.textContent = `${cardsWithImages.length} card${cardsWithImages.length !== 1 ? 's' : ''} found${nsfwText}`;
    }
}

// Update filter UI without recreating all options (performance optimization)
function updateFilterUI(menuContent, state) {
    if (!menuContent) return;

    // Update tag filter trigger text
    const tagFilterContainer = menuContent.querySelector('#bot-browser-tag-filter');
    if (tagFilterContainer) {
        const tagTriggerText = tagFilterContainer.querySelector('.selected-text');
        if (tagTriggerText) {
            if (state.filters.tags.length === 0) {
                tagTriggerText.textContent = 'All Tags';
            } else if (state.filters.tags.length === 1) {
                tagTriggerText.textContent = state.filters.tags[0];
            } else {
                tagTriggerText.textContent = `${state.filters.tags.length} Tags Selected`;
            }
        }

        // Update selected state on options
        const tagOptions = tagFilterContainer.querySelectorAll('.bot-browser-multi-select-option');
        tagOptions.forEach(option => {
            const value = option.dataset.value;
            if (value === '' && state.filters.tags.length === 0) {
                option.classList.add('selected');
            } else if (state.filters.tags.includes(value)) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    // Update creator filter trigger text
    const creatorFilterContainer = menuContent.querySelector('#bot-browser-creator-filter');
    if (creatorFilterContainer) {
        const creatorTriggerText = creatorFilterContainer.querySelector('.selected-text');
        if (creatorTriggerText) {
            if (!state.filters.creator) {
                creatorTriggerText.textContent = 'All Creators';
            } else {
                creatorTriggerText.textContent = state.filters.creator;
            }
        }

        // Update selected state on options
        const creatorOptions = creatorFilterContainer.querySelectorAll('.bot-browser-multi-select-option');
        creatorOptions.forEach(option => {
            const value = option.dataset.value;
            if (value === '' && !state.filters.creator) {
                option.classList.add('selected');
            } else if (state.filters.creator === value) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }

    // Update sort filter trigger text
    const sortFilterContainer = menuContent.querySelector('#bot-browser-sort-filter');
    if (sortFilterContainer) {
        const sortTriggerText = sortFilterContainer.querySelector('.selected-text');
        const sortOptions = sortFilterContainer.querySelectorAll('.bot-browser-multi-select-option');

        // Map values to display names (include Chub-specific options)
        const sortLabels = {
            'relevance': 'Relevance',
            'name_asc': 'Name (A-Z)',
            'name_desc': 'Name (Z-A)',
            'creator_asc': 'Creator (A-Z)',
            'creator_desc': 'Creator (Z-A)',
            // Chub API sort options
            'recent': '🕐 Recent',
            'trending': '🔥 Trending',
            'rating': '⭐ Top Rated',
            'stars': '✨ Most Stars',
            'downloads': '📥 Most Downloads',
            'favorites': '❤️ Most Favorites',
            'newcomer': '🆕 Newcomers',
            'activity': '📅 Recently Active'
        };

        if (sortTriggerText) {
            sortTriggerText.textContent = sortLabels[state.sortBy] || 'Relevance';
        }

        // Update selected state on options
        sortOptions.forEach(option => {
            const value = option.dataset.value;
            if (state.sortBy === value) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
    }
}
