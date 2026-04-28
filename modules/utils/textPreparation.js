import { escapeHTML } from './utils.js';

function escapeMetadata(metadata) {
    if (!metadata) return '';
    if (typeof metadata === 'string') return escapeHTML(metadata);
    try {
        return escapeHTML(JSON.stringify(metadata, null, 2));
    } catch {
        return escapeHTML('[unserializable metadata]');
    }
}

export function escapeCardTextFields(fullCard, tags, alternateGreetings, exampleMessages) {
    return {
        cardName: escapeHTML(fullCard.name),
        cardCreator: escapeHTML(fullCard.creator || ''),
        websiteDesc: escapeHTML(fullCard.website_description || ''),
        description: escapeHTML(fullCard.description || ''),
        descPreview: escapeHTML(fullCard.desc_preview || ''),
        personality: escapeHTML(fullCard.personality || ''),
        scenario: escapeHTML(fullCard.scenario || ''),
        firstMessage: escapeHTML(fullCard.first_message || ''),
        exampleMsg: escapeHTML(exampleMessages),
        tags: tags.map(tag => escapeHTML(tag)),
        creator: escapeHTML(fullCard.creator || ''),
        alternateGreetings: alternateGreetings.map(greeting => escapeHTML(greeting)),
        metadata: escapeMetadata(fullCard.metadata),
    };
}

export function processLorebookEntries(entries) {
    if (!entries || typeof entries !== 'object') {
        return null;
    }

    if (Array.isArray(entries)) {
        return entries.map((entry, index) => ({
            name: escapeHTML(entry.name || `Entry ${index}`),
            keywords: (entry.keywords || []).map(kw => escapeHTML(kw)),
            content: escapeHTML(entry.content || entry.description || entry)
        }));
    }

    return Object.entries(entries).map(([key, entry]) => ({
        name: escapeHTML(entry.name || `Entry ${key}`),
        keywords: (entry.keywords || []).map(kw => escapeHTML(kw)),
        content: escapeHTML(entry.content || entry.description || entry)
    }));
}
