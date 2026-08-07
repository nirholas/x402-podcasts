# x402-podcasts

Search the [Podcast Index](https://podcastindex.org) — the open, independent catalogue of
roughly four million podcast feeds that powers the Podcasting 2.0 ecosystem — and get back
show metadata with each show's newest episode, or the full record for one episode including
**the enclosure URL: the actual audio file**. That last part is what makes this useful to an
agent, because it turns "find me a podcast about X" into a URL you can download and
transcribe.

- **Base URL:** `http://localhost:4028` (self-host) — replace with your deployment's origin.
- **Manifest:** `GET /.well-known/x402`
- **OpenAPI:** `GET /openapi.json`
- **Contact:** nichxbt@gmail.com

## Payment

This service speaks **x402** (HTTP 402 Payment Required). Every paid route answers an
unpaid request with a 402 whose `accepts` array carries **two rails — USDC on Base (EVM)
and USDC on Solana. Your client picks whichever it can sign.**

```jsonc
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "2000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "resource": "http://localhost:4028/search", "mimeType": "application/json",
      "maxTimeoutSeconds": 60, "extra": { "name": "USDC", "version": "2" } },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "2000",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "resource": "http://localhost:4028/search", "mimeType": "application/json",
      "maxTimeoutSeconds": 60,
      "extra": { "name": "USD Coin", "decimals": 6, "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" } }
  ]
}
```

- **Protocol:** x402 v1, scheme `exact` · **Asset:** USDC (6 decimals) on both rails
- **Invocation contract:** every accept also carries `outputSchema.input` (how to build the
  request — method, query/path params, JSON body fields) and `outputSchema.output` (the JSON
  Schema of the 200 body). Both are elided above for readability and both are generated from
  `openapi.json`, so an agent can plan and call the route from the challenge alone.
- **Networks:** `base-sepolia` (default) or `base`; `solana` (default) or `solana-devnet`
- **Facilitators:** `https://x402.org/facilitator` (EVM) and `https://facilitator.payai.network`
  (Solana) — override with `FACILITATOR_URL` / `SOLANA_FACILITATOR_URL`
- **How to pay:** any x402 client. `x402-fetch` + `viem` on the EVM rail; on Solana build the
  SPL `transferChecked` (the fee is sponsored by `extra.feePayer`, so you need no SOL), sign
  it, and base64 the envelope into `X-PAYMENT`.
- **Receipt:** paid responses carry `X-PAYMENT-RESPONSE` (base64 JSON: `rail`, `network`,
  `transaction`, `payer`, `amount`) and repeat it inline as `receipt`.

Payment is per request. No account, no key, no minimum.

---

## `GET /search` — $0.002

Search shows by term. Each result carries the show's newest episode, so one paid call is
usually enough to go from a topic to a playable audio URL.

**Params**

| name | in | type | required | notes |
|---|---|---|---|---|
| `q` | query | string | yes | Free-text search over title, author and description. 1–200 characters |
| `max` | query | integer | no | 1–20, default 5. Values outside the range are clamped, not rejected |

**Response 200**

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
      "description": "The Podcast Index development team talks about the open podcasting namespace…",
      "url": "https://mp3s.nashownotes.com/pc20rss.xml",
      "link": "http://podcastindex.org/podcast/920666",
      "image": "https://…/pci_avatar.jpg",
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
        "transcripts": [{ "url": "https://…/PC20-180.srt", "type": "application/srt" }]
      }
    }
  ],
  "searchedAt": "2026-08-07T12:00:00.000Z",
  "receipt": { "success": true, "rail": "evm", "network": "base-sepolia", "transaction": "0x…" }
}
```

`hasValueBlock` is true when the feed publishes a Podcasting 2.0 `<podcast:value>` block —
i.e. the show itself accepts streaming micropayments. `latestEpisode` may be `null` if the
feed has no items or its episode lookup failed; the show entry is still returned.

## `GET /episode/:id` — $0.002

Full record for one episode, by Podcast Index episode id (the `episodeId` from `/search`).

**Params**

| name | in | type | notes |
|---|---|---|---|
| `id` | path | integer | Podcast Index episode id, positive integer |

**Response 200**

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
    "transcripts": [{ "url": "https://…/PC20-180.srt", "type": "application/srt" }],
    "guid": "PC20-180-2026-07-31"
  },
  "fetchedAt": "2026-08-07T12:00:00.000Z",
  "receipt": { "success": true, "rail": "solana", "network": "solana", "transaction": "5Qm…" }
}
```

`enclosureUrl` is the audio file. `transcripts` comes from the feed's Podcasting 2.0
`<podcast:transcript>` tags — when it is non-empty you can read the episode instead of
transcribing it, which is far cheaper.

## Free routes

| route | returns |
|---|---|
| `GET /` | service card: rails, prices, **current data source**, doc links |
| `GET /health` | `{ ok, uptime, source }` |
| `GET /skill.md` | this file |
| `GET /.well-known/x402` | machine-readable resource manifest |
| `GET /openapi.json` | OpenAPI 3.1 |

## Data source — read `source` before you trust a result

Every paid response carries a `source` field:

| `source` | meaning |
|---|---|
| `podcastindex-live` | fetched from the Podcast Index API at request time |
| `fixture` | the deployment has no Podcast Index credentials and served a deterministic sample |

Fixture mode exists so the demo runs with zero signups. It returns three real shows
(*Podcasting 2.0*, *Linux Unplugged*, *The Changelog*) with one episode each, filtered by
your query. **Do not present fixture data as a real search result.** `GET /` lists the
fixture episode ids so you can exercise `/episode/:id` without keys.

To go live, the operator sets `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET` — free and
instant at <https://api.podcastindex.org/signup>.

## Errors

| status | body `error` | meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | `q` missing, longer than 200 chars, `max` not a number, or a non-integer episode id |
| 402 | — | payment required or rejected; body is the dual-rail challenge with `error` explaining why |
| 404 | `EPISODE_NOT_FOUND` | no such episode (in fixture mode, the message lists the ids that do exist) |
| 502 | `PODCAST_INDEX_AUTH_FAILED` | the deployment's Podcast Index credentials were rejected |
| 502 | `PODCAST_INDEX_RATE_LIMITED` | upstream rate limit — retry with backoff |
| 502 | `PODCAST_INDEX_ERROR` | upstream returned something unexpected |
| 504 | `PODCAST_INDEX_TIMEOUT` | upstream did not answer within 12 seconds |
