# The raw 402 → pay → 200 walkthrough

No SDK — just HTTP, so you can see exactly what the protocol does.

```bash
npm install && npm run dev     # http://localhost:4028
```

## 0. Discover the service for free

```bash
curl -s localhost:4028/ | jq '{name, dataSource, endpoints}'
curl -s localhost:4028/.well-known/x402 | jq '.resources[] | {resource, price}'
```

```
{ "resource": "GET /search",        "price": "$0.002" }
{ "resource": "GET /episode/:id",   "price": "$0.002" }
```

`dataSource` tells you whether this deployment is live or on fixtures — check it before you
spend anything:

```json
{
  "source": "fixture",
  "live": false,
  "note": "Fixture mode: PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET are unset…",
  "fixtureEpisodeIds": [16795090960, 16795091422, 16795092001]
}
```

## 1. Search without paying → 402 with **both** rails

```bash
curl -i -s 'localhost:4028/search?q=podcasting%202.0'
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```

```jsonc
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "2000",              // 2000 base units = $0.002 USDC (6 dp)
      "resource": "http://localhost:4028/search",
      "description": "Podcast search: matching shows with metadata and each one's latest episode",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "2000",
      "resource": "http://localhost:4028/search",
      "description": "Podcast search: matching shows with metadata and each one's latest episode",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 60,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": { "name": "USD Coin", "decimals": 6, "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" }
    }
  ]
}
```

Just the rails:

```bash
curl -s 'localhost:4028/search?q=linux' | jq '.accepts[] | {network, asset, payTo, maxAmountRequired}'
```

Note `resource` is the path without the query string — the price does not depend on what you
search for.

## 2. Build the payment

`X-PAYMENT` is base64 of a JSON payload proving you authorised exactly
`maxAmountRequired` to `payTo` on the rail you chose.

**EVM rail** — an EIP-3009 `transferWithAuthorization` signature over
`{ from, to: payTo, value: maxAmountRequired, validAfter, validBefore, nonce }`, signed for
the USDC contract in `asset`:

```jsonc
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x…",
    "authorization": {
      "from": "0xYourWallet",
      "to": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "value": "2000",
      "validAfter": "0",
      "validBefore": "1791234567",
      "nonce": "0x…"
    }
  }
}
```

**Solana rail** — a signed SPL `transferChecked` transaction, base64, in the same envelope.
`@three-ws/x402-payment-modal/server` builds and encodes it (`prepareSolanaCheckout` → sign
→ `encodeX402Payment`).

```bash
X_PAYMENT=$(printf '%s' "$PAYLOAD_JSON" | base64 -w0)
```

Worth doing by hand once. After that:

```bash
PRIVATE_KEY=0xyourTestnetKey npm run client
```

## 3. Retry with the header → 200 + the artifact

```bash
curl -i -s 'localhost:4028/search?q=podcasting%202.0&max=2' -H "X-PAYMENT: $X_PAYMENT"
```

```http
HTTP/1.1 200 OK
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJyYWlsIjoiZXZtIiwi…
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
      "categories": ["Technology", "News"],
      "episodeCount": 180,
      "hasValueBlock": true,
      "latestEpisode": {
        "episodeId": 16795090960,
        "title": "Episode 180: The Namespace Grows Up",
        "enclosureUrl": "https://op3.dev/e/mp3s.nashownotes.com/PC20-180.mp3",
        "enclosureType": "audio/mpeg",
        "durationSeconds": 4920,
        "transcripts": [{ "url": "https://…/PC20-180.srt", "type": "application/srt" }]
      }
    }
  ],
  "searchedAt": "2026-08-07T12:00:00.000Z",
  "receipt": { "success": true, "rail": "evm", "network": "base-sepolia", "transaction": "0x…" }
}
```

Decode the receipt header:

```bash
echo "$RESPONSE_HEADER" | base64 -d | jq
# { "success": true, "rail": "evm", "network": "base-sepolia",
#   "transaction": "0xabc…", "payer": "0xYourWallet", "amount": "2000",
#   "asset": "0x036CbD…", "resource": "http://localhost:4028/search" }
```

## 4. One episode in full

```bash
curl -s localhost:4028/episode/16795090960 -H "X-PAYMENT: $X_PAYMENT_2" | jq .episode
```

```json
{
  "episodeId": 16795090960,
  "feedTitle": "Podcasting 2.0",
  "title": "Episode 180: The Namespace Grows Up",
  "datePublished": "2026-07-31T18:00:00.000Z",
  "durationSeconds": 4920,
  "enclosureUrl": "https://op3.dev/e/mp3s.nashownotes.com/PC20-180.mp3",
  "enclosureType": "audio/mpeg",
  "enclosureLength": 78720000,
  "transcripts": [{ "url": "https://…/PC20-180.srt", "type": "application/srt" }],
  "guid": "PC20-180-2026-07-31"
}
```

Each paid call needs its own payment — the `X-PAYMENT` header is not a session.

Then the audio is just a file:

```bash
curl -sL -o episode.mp3 "$(jq -r .episode.enclosureUrl < episode.json)"
```

## 5. Live vs fixture

Without credentials the server still answers, from deterministic samples:

```bash
curl -s 'localhost:4028/search?q=linux' -H "X-PAYMENT: $X_PAYMENT" | jq '{source, count}'
# { "source": "fixture", "count": 1 }
```

Turn on live data:

```bash
# free key, issued instantly: https://api.podcastindex.org/signup
export PODCAST_INDEX_KEY=...
export PODCAST_INDEX_SECRET=...
npm run dev
curl -s localhost:4028/health | jq .source     # "podcastindex-live"
```

## Errors you may hit

| what you sent | you get |
|---|---|
| no header | 402, `error: "X-PAYMENT header is required"` |
| garbage header | 402, `error: "invalid X-PAYMENT header: …"` |
| a rail we don't take | 402, `error: "unsupported rail: …"` |
| short-paid or expired authorisation | 402, `error:` the facilitator's `invalidReason` |
| `/search` with no `q` | 400, `BAD_REQUEST` |
| `/episode/abc` | 400, `BAD_REQUEST` |
| `/episode/999999999` | 404, `EPISODE_NOT_FOUND` |
| too many upstream calls | 502, `PODCAST_INDEX_RATE_LIMITED` |
| bad credentials on the server | 502, `PODCAST_INDEX_AUTH_FAILED` |
