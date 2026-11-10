---
name: search-podcasts
description: Run the x402-podcasts HTTP service and call its paid routes to search podcasts and fetch one episode's details from the Podcast Index API. Use when an agent needs podcast data and can pay per query in USDC over x402.
---

# x402-podcasts

x402-podcasts serves Podcast Index data. Always read the `source` field before trusting a result: `podcastindex-live` means fetched at request time, `fixture` means the deployment has no credentials and served a deterministic sample.

Paying is irreversible. Before any paid call, show the user the route, price, network and payTo address from the 402 response, and wait for an explicit yes.

## Run the service

From a clone (Node 18+):

```bash
git clone https://github.com/nirholas/x402-podcasts
cd x402-podcasts && npm install
npm run dev        # tsx src/server.ts, listens on :4028 (PORT overrides)
```

Environment (see `.env.example`): `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET` (Podcast Index API credentials; without them the service serves labelled fixtures). Payment settings: `PAY_TO_ADDRESS` (Base receive address), `SOLANA_PAY_TO_ADDRESS`, `NETWORK` (`base-sepolia` default, or `base`), `SOLANA_NETWORK`, `FACILITATOR_URL`, `PUBLIC_BASE_URL`. Set your own pay-to addresses to be paid yourself. `npm run build` then `npm start` runs the compiled server.

## Routes

| Route | Price | Params |
|---|---|---|
| `GET /search` | $0.002 | `q` required (1-200 chars, searches title, author, description); `max` (1-20, default 5, clamped) |
| `GET /episode/:id` | $0.002 | `id` is a positive integer Podcast Index episode id |
| `GET /`, `GET /health`, `GET /skill.md`, `GET /openapi.json`, `GET /.well-known/x402` | free | service card, status, docs, discovery |

## Paying

An unpaid request to a paid route returns 402 with an `accepts` array listing both rails (USDC on Base or Solana). Sign the entry your wallet supports and retry with the base64 `X-PAYMENT` header. The settlement receipt is in the `X-PAYMENT-RESPONSE` header. The reference client is `examples/agent-client.ts` (`npm run client`), which uses `x402-fetch` with `PRIVATE_KEY` for a Base Sepolia wallet and `BASE_URL` (default `http://localhost:4028`).

Errors: 400 `BAD_REQUEST`, 404 `EPISODE_NOT_FOUND`, 502 `PODCAST_INDEX_AUTH_FAILED`, `PODCAST_INDEX_RATE_LIMITED` (retry with backoff) or `PODCAST_INDEX_ERROR`, 504 `PODCAST_INDEX_TIMEOUT` (upstream gave no answer within 12 seconds).

## Example

```bash
curl -i "localhost:4028/search?q=rust%20async&max=5"
# 402 first. After approval and payment: feeds and episodes with ids, then pay for GET /episode/<id>.
```
