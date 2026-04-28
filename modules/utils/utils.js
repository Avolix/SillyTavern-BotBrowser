// Utility functions for Bot Browser extension

// Debounce helper function
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Helper function to decode UTF-8 escape sequences (fixes Korean text)
export function decodeUTF8(text) {
    if (!text) return '';
    try {
        // Fix double-encoded UTF-8
        if (text.includes('\\x')) {
            // Convert \xXX sequences to actual bytes
            text = text.replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) => {
                return String.fromCharCode(parseInt(hex, 16));
            });
        }
        // Try to decode as UTF-8
        return decodeURIComponent(escape(text));
    } catch (e) {
        return text;
    }
}

// Helper function to safely escape HTML (prevents XSS)
export function escapeHTML(text) {
    if (!text) return '';
    // First decode UTF-8 sequences
    text = decodeUTF8(text);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// CORS proxy rotation for character_tavern images
const CORS_PROXIES = [
    'https://corsproxy.io/?',
    'https://api.cors.lol/?url='
];

// Get a random CORS proxy
export function getRandomCorsProxy() {
    return CORS_PROXIES[Math.floor(Math.random() * CORS_PROXIES.length)];
}

// Helper function to sanitize image URLs (prevents attribute injection)
export function sanitizeImageUrl(url) {
    if (!url) return '';
    let trimmed = url.trim();

    // Only allow http:// and https:// URLs
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        // Rotate CORS proxy for character_tavern images to spread load
        if (trimmed.includes('corsproxy.io')) {
            // Extract the actual URL after the proxy
            const afterProxy = trimmed.split('corsproxy.io/?')[1];
            if (afterProxy) {
                // Remove url= prefix to get the actual target URL
                const actualUrl = afterProxy.replace(/^url=/, '');
                // Use a random proxy instead
                trimmed = getRandomCorsProxy() + actualUrl;
            }
        }

        // Percent-encode quotes and parens so the URL can never break out of an
        // HTML attribute *or* a CSS url('…') / url("…") string. escapeHTML alone
        // is insufficient: the HTML parser decodes &#039; back to ' before CSS
        // sees the value, allowing CSS-string escape from style="… url('…') …".
        trimmed = trimmed
            .replace(/'/g, '%27')
            .replace(/"/g, '%22')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29');

        // Escape HTML entities to prevent attribute injection
        return escapeHTML(trimmed);
    }
    return '';
}
