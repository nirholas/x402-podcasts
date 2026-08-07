# API reference

Base URL: `http://localhost:4028` when self-hosting. Machine-readable equivalents:
[`openapi.json`](https://github.com/nirholas/x402-podcasts/blob/main/openapi.json) and
[`/.well-known/x402`](https://github.com/nirholas/x402-podcasts/blob/main/public/.well-known/x402).

All prices are USDC. Every paid route accepts **both** rails — Base (EVM) and Solana — and
returns the purchased artifact in the 200 body.

Every paid response carries a `source` field. Read it before you trust the data — see
[Data source](#data-source) at the bottom.

---

## `GET /search`

**Price:** $0.002 · **Returns:** matching shows, each with its newest episode

### Parameters

| name | in | type | required | notes |
|---|---|---|---|---|
| `q` | query | string | yes | Free-text search over title, author and description. 1–200 characters. Longer is a `400` |
| `max` | query | integer | no | How many shows. Default 5, **clamped** to 1–20 rather than rejected. Non-numeric is a `400` |

### Response 200 — `SearchResult`

| field | type | meaning |
|---|---|---|
| `query` | string | the trimmed term that was searched |
| `source` | `"podcastindex-live"` \| `"fixture"` | where the data came from |
| `count` | integer | number of shows in `shows` |
| `shows` | `Show[]` | see below |
| `searchedAt` | ISO 8601 | when the query ran |
| `receipt` | object \| null | settlement receipt, mirroring `X-PAYMENT-RESPONSE` |

#### `Show`

| field | type | meaning |
|---|---|---|
| `feedId` | integer | Podcast Index feed id — the handle for everything else |
| `title` | string | show title |
| `author` | string \| null | author, falling back to the feed owner name |
| `description` | string \| null | show description |
| `url` | string \| null | the **RSS feed URL** — parse it yourself if you prefer |
| `link` | string \| null | show homepage |
| `image` | string \| null | artwork, preferring the higher-resolution `artwork` field |
| `language` | string \| null | e.g. `en`, `de` |
| `categories` | string[] | Podcast Index categories, e.g. `["Technology", "News"]` |
| `episodeCount` | integer \| null | episodes the index knows about |
| `lastUpdate` | ISO 8601 \| null | newest item's publish date, falling back to last index update |
| `explicit` | boolean | feed-level explicit flag |
| `hasValueBlock` | boolean | the feed publishes a Podcasting 2.0 `<podcast:value>` block — the show accepts streaming micropayments |
| `latestEpisode` | `Episode` \| null | the newest episode, or `null` if the feed has no items or its lookup failed |

#### `Episode`

| field | type | meaning |
|---|---|---|
| `episodeId` | integer | Podcast Index episode id — pass to `/episode/:id` |
| `feedId` / `feedTitle` | integer \| null / string \| null | which show it belongs to |
| `title` | string | episode title |
| `description` | string \| null | show notes, as published |
| `datePublished` | ISO 8601 \| null | publish time |
| `durationSeconds` | integer \| null | runtime; `null` when the feed omits or zeroes it |
| **`enclosureUrl`** | string \| null | **the audio file.** The reason this service exists |
| `enclosureType` | string \| null | e.g. `audio/mpeg` |
| `enclosureLength` | integer \| null | bytes — check before downloading |
| `episodeNumber` / `season` | integer \| null | as published |
| `explicit` | boolean | episode-level flag |
| `image` | string \| null | episode artwork, falling back to feed artwork |
| `link` | string \| null | episode page |
| **`transcripts`** | `{url, type}[]` | Podcasting 2.0 `<podcast:transcript>` files. Non-empty means you can *read* the episode instead of transcribing it |
| `guid` | string \| null | feed-level GUID |

### Example

```bash
curl -s 'localhost:4028/search?q=podcasting%202.0&max=2' -H "X-PAYMENT: $PAID" | jq
```

```json
{
  "query": "podcasting 2.0",
  "source": "podcastindex-live",
  "count": 1,
  "shows": [
    {
      "feedId": 920666,
      "title": "Podcasting 2.0",
      "author": "Podcast Index LLC",
      "url": "https://mp3s.nashownotes.com/pc20rss.xml",
      "link": "http://podcastindex.org/podcast/920666",
      "language": "en",
      "categories": ["Technology", "News"],
      "episodeCount": 180,
      "lastUpdate": "2026-07-31T18:00:00.000Z",
      "explicit": false,
      "hasValueBlock": true,
      "latestEpisode": {
        "episodeId": 16795090960,
        "title": "Episode 180: The Namespace Grows Up",
        "datePublished": "2026-07-31T18:00:00.000Z",
        "durationSeconds": 4920,
        "enclosureUrl": "https://op3.dev/e/mp3s.nashownotes.com/PC20-180.mp3",
        "enclosureType": "audio/mpeg",
        "enclosureLength": 78720000,
        "episodeNumber": 180,
        "transcripts": [
          { "url": "https://mp3s.nashownotes.com/PC20-180.srt", "type": "application/srt" }
        ],
        "guid": "PC20-180-2026-07-31"
      }
    }
  ],
  "searchedAt": "2026-08-07T12:00:00.000Z",
  "receipt": {
    "success": true,
    "rail": "evm",
    "network": "base-sepolia",
    "transaction": "0xabc…",
    "payer": "0xYourWallet",
    "amount": "2000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "resource": "http://localhost:4028/search"
  }
}
```

### Cost note

In live mode this route makes **1 + N** upstream calls: one search, then one newest-episode
lookup per show returned. You pay the same $0.002 either way, but `max=20` does twenty times
the upstream work — ask for what you need.

### Errors

| status | `error` | cause |
|---|---|---|
| 400 | `BAD_REQUEST` | `q` missing or empty, `q` longer than 200 characters, `max` not a number |
| 402 | — | payment required or rejected; body is the challenge |
| 502 | `PODCAST_INDEX_AUTH_FAILED` | the deployment's credentials were rejected |
| 502 | `PODCAST_INDEX_RATE_LIMITED` | upstream rate limit — back off and retry |
| 502 | `PODCAST_INDEX_ERROR` | upstream returned something unexpected |
| 504 | `PODCAST_INDEX_TIMEOUT` | upstream did not answer within 12 seconds |

---

## `GET /episode/:id`

**Price:** $0.002 · **Returns:** one `Episode` in full

### Parameters

| name | in | type | notes |
|---|---|---|---|
| `id` | path | integer | Podcast Index episode id — the `episodeId` from a `/search` result. Positive integer; anything else is a `400` |

### Response 200 — `EpisodeResult`

```json
{
  "source": "podcastindex-live",
  "episode": {
    "episodeId": 16795090960,
    "feedId": 920666,
    "feedTitle": "Podcasting 2.0",
    "title": "Episode 180: The Namespace Grows Up",
    "description": "Adam and Dave walk through the newest tags in the podcast namespace…",
    "datePublished": "2026-07-31T18:00:00.000Z",
    "durationSeconds": 4920,
    "enclosureUrl": "https://op3.dev/e/mp3s.nashownotes.com/PC20-180.mp3",
    "enclosureType": "audio/mpeg",
    "enclosureLength": 78720000,
    "episodeNumber": 180,
    "season": null,
    "explicit": false,
    "image": "https://…/pci_avatar.jpg",
    "link": "http://podcastindex.org/podcast/920666",
    "transcripts": [
      { "url": "https://mp3s.nashownotes.com/PC20-180.srt", "type": "application/srt" }
    ],
    "guid": "PC20-180-2026-07-31"
  },
  "fetchedAt": "2026-08-07T12:00:00.000Z",
  "receipt": { "…": "…" }
}
```

Same `Episode` shape as `latestEpisode` in a search result — so if you have just searched and
want that episode, **you already have this record.** Use this route for older episodes, or
when you have an id from elsewhere.

### Errors

| status | `error` | cause |
|---|---|---|
| 400 | `BAD_REQUEST` | the id is not a positive integer |
| 402 | — | payment required or rejected |
| 404 | `EPISODE_NOT_FOUND` | no such episode. In fixture mode the message lists the ids that do exist |
| 502 / 504 | `PODCAST_INDEX_*` | upstream trouble, as above |

---

## Free routes

| route | returns |
|---|---|
| `GET /` | service card: rails, prices, **current data source** (and fixture ids in fixture mode), doc links |
| `GET /health` | `{ ok: true, uptime: <seconds>, source }` |
| `GET /skill.md` | the agent-facing skill file, `text/markdown` |
| `GET /.well-known/x402` | resource manifest with prices, rails and schemas |
| `GET /openapi.json` | OpenAPI 3.1 |

---

## Data source

| `source` | meaning |
|---|---|
| `podcastindex-live` | fetched from the [Podcast Index](https://podcastindex.org) API at request time |
| `fixture` | the deployment has no Podcast Index credentials and served a deterministic sample |

Fixture mode returns three real shows — *Podcasting 2.0*, *Linux Unplugged*, *The
Changelog* — with one episode each, filtered by your query, falling back to all three when
nothing matches. Shapes and semantics are identical to live mode, so client code needs no
branching. **Do not present fixture data as a real search result.**

To go live the operator sets `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET` — free and
instant at <https://api.podcastindex.org/signup>. Credentials stay on the server; clients
only ever see x402.

---

## Payment

### The 402 body

```jsonc
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [ /* one PaymentRequirements per rail */ ]
}
```

`PaymentRequirements`:

| field | example | notes |
|---|---|---|
| `scheme` | `"exact"` | the only scheme accepted |
| `network` | `"base-sepolia"` / `"solana"` | switched by `NETWORK` and `SOLANA_NETWORK` |
| `maxAmountRequired` | `"2000"` | base units; USDC has 6 decimals, so this is $0.002 |
| `resource` | `"http://localhost:4028/search"` | absolute URL, path only — the query string does not affect price |
| `description` | `"Podcast search: matching shows…"` | shown by wallets and the checkout modal |
| `mimeType` | `"application/json"` | what the 200 will be |
| `payTo` | `0x40252CF…` / `WwwuGbqH…` | receive address for that rail |
| `maxTimeoutSeconds` | `60` | how long the authorisation stays valid |
| `asset` | USDC address / SPL mint | the token you pay in |
| `extra` | `{ name, version }` / `{ name, decimals, feePayer }` | EIP-712 domain on EVM; the fee sponsor on Solana |

### The receipt

Paid responses set `X-PAYMENT-RESPONSE` to base64 JSON and repeat it inline as `receipt`:

```json
{
  "success": true,
  "rail": "solana",
  "network": "solana",
  "transaction": "5Qm…",
  "payer": "…",
  "amount": "2000",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "resource": "http://localhost:4028/search"
}
```

### 402 reasons

| `error` | meaning |
|---|---|
| `X-PAYMENT header is required` | first, unpaid attempt — normal |
| `invalid X-PAYMENT header: …` | not base64, or not a valid x402 payload |
| `unsupported rail: this endpoint does not accept exact on <network>` | you signed on a rail this server does not take |
| `payment rejected: <reason>` | the facilitator's `invalidReason` — `insufficient_funds`, `payment_expired`, `invalid_exact_evm_payload_signature`, … |
| `settlement failed: <reason>` | verified but could not be broadcast |

A facilitator outage returns `502 facilitator_unreachable` or `502 settlement_error` rather
than a 402, so a retry loop cannot mistake an outage for a price.
