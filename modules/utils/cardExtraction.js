export function extractCardProperties(fullCard) {
    const tags = fullCard.tags || [];
    const alternateGreetings = fullCard.alternate_greetings || [];
    const exampleMessages = fullCard.example_messages || fullCard.mes_example || '';

    let imageUrl = fullCard.avatar_url || fullCard.image_url || '';

    if (imageUrl.includes('realm.risuai.net') && fullCard.avatar_url) {
        imageUrl = fullCard.avatar_url;
    }

    return {
        imageUrl,
        tags,
        alternateGreetings,
        exampleMessages,
        id: fullCard.id || null,
        service: fullCard.service || null,
        possibleNsfw: fullCard.possibleNsfw || false
    };
}

export function getLorebookInfo(fullCard, isLorebook) {
    const entries = fullCard.entries || null;
    const entriesCount = isLorebook && entries ? Object.keys(entries).length : 0;

    return {
        entries,
        entriesCount
    };
}
