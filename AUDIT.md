# Security Audit — SillyTavern-BotBrowser fork

**Date:** 2026-04-28
**Scope:** Every file under the repository root (4,620 LoC across 16 JS files + manifest + CSS + README)
**Threat model:** Stored XSS / RCE inside SillyTavern, equivalent to the `rentry.co/st-backdoor` incident (XSS sink → fengari-web → API key exfiltration via `srv.us` tunnels)
**Method:** IOC scan, sink scan (XSS/RCE/network/obfuscation), full file read of every JS module, attribute-context interpolation scan, diff against `b97824d initial`

---

## TL;DR

The original backdoor is **fully remediated** at the original sinks (`detailModal.js`, `cache.js`). No active malicious code, no IOCs from the rentry, no obfuscated payloads, no `eval` / `Function` / dynamic script injection / WebSocket / SSH-tunnel destinations. The only `import()` is a legitimate dynamic load of SillyTavern's own `lib/jszip.min.js`.

**Remaining issues** (one in the same class as the original bug):

| # | Severity | Where | Issue |
|---|---|---|---|
| 1 | **HIGH** | `modules/templates/templates.js:21,59` | `card.id` interpolated unescaped into `data-card-id="..."` attributes. Card IDs come from network/Chub API and are persisted to localStorage via "recently viewed". Same XSS class as the original backdoor. |
| 2 | MEDIUM | `modules/templates/templates.js:22,60`; `modules/templates/detailModal.js:15` | `style="background-image: url('${safeImageUrl}')"` — `escapeHTML` turns `'` into `&#039;` which the HTML parser decodes back to `'` before CSS sees it. URLs containing `'` could break out of the CSS string. Modern browsers block `javascript:` in `background-image:` so script execution is unlikely, but layout/phishing overlays remain possible. |
| 3 | LOW | `manifest.json:8,10`; `README.md:12` | Still attribute the extension to `mia13165` (the attacker account from the rentry). Misleading; should reflect the actual maintainer. |
| 4 | INFO | `modules/services/import.js:61,102` | `card.id` is forwarded as the `url` parameter to SillyTavern's `/api/content/importURL`. Server-side fetch of attacker-controlled URL — host-validated by SillyTavern, not the extension. Worth noting only. |
| 5 | INFO | `modules/utils/utils.js:48-51` | Card images for some sources are routed through `corsproxy.io` and `api.cors.lol`. Those proxies see the image URLs. Privacy, not security. |

---

## What was checked (and found clean)

### IOC scan
Searched for every indicator from the rentry. Zero hits except in the user's own remediation comments in `cache.js`:
- `gm92342` / `mia13165` / `sdhiabfkgcnf` — only in remediation comments + manifest/README (issue #3).
- `srv.us`, `session-2389432`, `fengari`, `deddbd095a67a28da4b4b7b65533561f`, `st-anchor-2025`, `allowKeysExposure` — none.

### Code-execution sinks
- `eval`, `new Function`, `Function(...)` — none.
- `setTimeout("string", ...)` / `setInterval("string", ...)` — none. All `setTimeout` calls take function arguments.
- `document.createElement('script')` / `appendChild(script)` / Worker / SharedWorker — none.
- `import(...)` — exactly one, in `import.js:429`: `await import('../../../../../../lib/jszip.min.js')` — relative path into SillyTavern's bundled `lib/`. Path is a hardcoded literal; cannot be redirected.

### Network sinks
- All `fetch()` destinations enumerated:
  - `${baseUrl}/...` where `baseUrl = 'https://raw.githubusercontent.com/MeowCatboyMeow/updated_cards/...'` (your repo).
  - `/api/content/importURL` and `/api/characters/import` (SillyTavern internal).
  - `https://realm.risuai.net/api/v1/download/...` (legitimate).
  - `https://api.chub.ai/search?...` (legitimate).
  - `imageUrl` from card data (3rd-party image hosts; client-side fetch only, no SSRF).
  - `default_avatar` (SillyTavern internal).
- No `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `navigator.sendBeacon`.
- No suspicious destinations (`*.srv.us`, gist.github.com, `raw.githubusercontent.com/<unknown>`).

### XSS sinks (innerHTML and friends)
Every `innerHTML` site enumerated and traced to its data source:

| Site | Data source | Verdict |
|---|---|---|
| `index.js:199,948` | `getOriginalMenuHTML(state.recentlyViewed)` | Recently viewed names/avatars are escaped via `escapeHTML` / `sanitizeImageUrl`. **`card.id` is NOT escaped** (issue #1). |
| `index.js:206,955` | `createBottomActions()` | Static template, safe. |
| `index.js:449` | Settings modal | All values from `extension_settings[extensionName]` (user-written booleans/numbers/strings). Self-XSS only — not a real threat. |
| `index.js:739` | Stats modal | All user-controlled fields (`imp.name`, `imp.creator`, `imp.source`, `creator`) are escaped via `escapeHTML`. Safe. |
| `browser.js:81` | `createBrowserHeader(...)` | Search value is escaped; sort options are hardcoded. Safe. |
| `browser.js:104,138` | Filter dropdowns | Cleared, then options inserted via `appendChild`. Safe. |
| `browser.js:110,144` | Static "All Tags" / "All Creators" labels | Safe. |
| `browser.js:119,153` | Tag/creator option labels | Escaped via `escapeHTML(tag)` / `escapeHTML(creator)`. Safe. |
| `browser.js:454,536` | Loading spinner | Static template, safe. |
| `browser.js:612` | `cardsHTML + paginationHTML` from `createCardHTML` | Pre-escaped names/creators/tags. **`card.id` is NOT escaped** (issue #1). |
| `cards.js:230` | Image error fallback | `errorCode` is `'Network Error'` / `'Unknown Error'` / `\`Error ${response.status}\`` (status is a number). Safe. |
| `modals/detail.js:91` | `buildDetailModalHTML(...)` | Receives pre-escaped data from `prepareCardDataForModal` → `escapeCardTextFields` / `processLorebookEntries`. Safe. |
| `modals/detail.js:227,306,313` | Image error fallback | Same as above. Safe. |
| `modals/detail.js:325` | `'<i class="fa-solid fa-times"></i>'` | Static, safe. |

### Obfuscation scan
- `atob`/`btoa` — only in `import.js` for legitimate base64-encoding of character JSON before embedding in PNG `tEXt` chunks (V2 spec).
- `String.fromCharCode` — used in `decodeUTF8` to decode `\xNN` mojibake (one-line, transparent), and in `import.js` for parsing PNG chunk type bytes (4-byte ASCII).
- No long base64 blobs, no charCode arrays, no Vigenère/LCG decoder, no seeded-PRNG string tables.

### Dependencies
- `manifest.json` declares no JS deps. `index.js` imports from SillyTavern's own modules and from local `modules/`. `lib/jszip.min.js` (host-bundled) is the only third-party.
- No `package.json`, no `node_modules`, no `package-lock.json` — nothing to audit on the supply-chain side.

### Git history
Diffed `b97824d initial` (2025-11-22, your first commit) against `HEAD`. All 12 modified files show legitimate growth (Chub API integration, sort options, NSFW handling, security remediation). No code was renamed/refactored to hide a payload. The user's "initial" commit was already clean — `cache.js` pointed at `mia13165/updated_cards` (now blocked + redirected) but contained no XSS/RCE logic itself.

---

## What I propose to fix

1. **Issue #1 (HIGH)** — escape `card.id` in `templates.js`. One-line fix using existing `escapeHTML`. **Will apply.**
2. **Issue #2 (MEDIUM)** — harden `sanitizeImageUrl` to also URL-encode `'` and `"` (both can break out of `url('...')`/`url("...")`). Defense-in-depth. **Will apply.**
3. **Issue #3 (LOW)** — update `manifest.json` author/homePage and `README.md` URL to the actual maintainer's namespace. **Will apply.**
4. **Issue #4 (INFO)** — no extension-side fix possible; rely on SillyTavern host validation of `/api/content/importURL`. Documented here.
5. **Issue #5 (INFO)** — `corsproxy.io` / `api.cors.lol` exposure is intrinsic to fetching cross-origin images from inside the browser. Documented here.

Nothing else flagged.
