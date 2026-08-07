# Tutorial — from clone to a paid podcast search

Fifteen minutes, no accounts. By the end you will have run the server, seen a real dual-rail
402, paid it with testnet USDC, pulled an episode's audio URL out of the 200, and switched
the deployment from fixtures to live Podcast Index data.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-podcasts.git
cd x402-podcasts
npm install
```

Node 18 or newer. Runtime dependencies: `express`, `x402`, `dotenv`.

## 2. Configure (optional)

```bash
cp .env.example .env
```

It ships with the suite's public receive addresses already filled in, so the server runs
as-is:

```bash
PAY_TO_ADDRESS=0x40252CFDF8B20Ed757D61ff157719F33Ec332402
SOLANA_PAY_TO_ADDRESS=WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
```

Change both to your own addresses if you want the money. Everything else is commented out
with sane defaults: `base-sepolia` for the EVM rail, `solana` mainnet for Solana,
`https://x402.org/facilitator` for EVM settlement, `https://facilitator.payai.network` for
Solana settlement, port `4028`.

Podcast Index credentials are optional for now — step 8 turns them on.

## 3. Run the server

```bash
npm run dev
```

```
x402-podcasts listening on http://localhost:4028
Payment rails (USDC — the client picks):
  evm     base-sepolia   → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402  via https://x402.org/facilitator
  solana  solana         → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW  via https://facilitator.payai.network
  note: using suite default payTo — set PAY_TO_ADDRESS / SOLANA_PAY_TO_ADDRESS to receive funds yourself
Data source: fixtures — set PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET for live data
Paid routes:
  GET /search?q=…          $0.002
  GET /episode/:id         $0.002
Free routes: GET /  GET /health  GET /skill.md  GET /.well-known/x402  GET /openapi.json
```

Check the free routes, and note what the service card says about its data:

```bash
curl -s localhost:4028/ | jq .dataSource
```

```json
{
  "source": "fixture",
  "live": false,
  "note": "Fixture mode: PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET are unset…",
  "fixtureEpisodeIds": [16795090960, 16795091422, 16795092001]
}
```

## 4. Your first 402

```bash
curl -i -s 'localhost:4028/search?q=podcasting%202.0'
```

```jsonc
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "2000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", … },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "2000",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", … }
  ]
}
```

Read it as a price list. `maxAmountRequired` is in the asset's base units — USDC has six
decimals, so `"2000"` is $0.002. Two entries means two ways to buy the identical result;
your client picks, and the server has no preference.

Note `resource` is the path without the query string. The price does not depend on what you
search for.

## 5. Get a funded test wallet

1. Throwaway key: `openssl rand -hex 32`, prefixed with `0x`.
2. Its address: `npx tsx -e "import {privateKeyToAccount} from 'viem/accounts'; console.log(privateKeyToAccount(process.env.K).address)"`.
3. Testnet USDC from the [Circle faucet](https://faucet.circle.com) — pick Base Sepolia. A
   dollar buys 500 searches.

## 6. Pay for a search

```bash
PRIVATE_KEY=0xyourTestnetKey Q="podcasting 2.0" npm run client
```

```
data source: fixture — Fixture mode: PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET are unset…

① Unpaid request → expect a dual-rail 402
   accepts: base-sepolia   2000 base units USDC → 0x40252CF…
   accepts: solana         2000 base units USDC → WwwuGbqH…

② Paying from 0xYourWallet on Base Sepolia — $0.002 per call

③ 200 — 1 show(s) for "podcasting 2.0" (source: fixture)

   Podcasting 2.0 — Podcast Index LLC
   feedId 920666 · 180 episodes · Technology, News
   latest: #180 Episode 180: The Namespace Grows Up
           https://op3.dev/e/mp3s.nashownotes.com/PC20-180-2026-07-31-Final.mp3
           transcript: https://mp3s.nashownotes.com/PC20-180-2026-07-31-Final.srt

   X-PAYMENT-RESPONSE: { success: true, rail: 'evm', transaction: '0x…' }
```

What `wrapFetchWithPayment` did: caught the 402, picked the `base-sepolia` entry, signed an
EIP-3009 `transferWithAuthorization` for exactly 2000 base units to `payTo`, base64'd it
into `X-PAYMENT`, and replayed the request. The server verified and settled it through the
facilitator before the route handler ran.

## 7. Reading the artifact

The interesting fields, in the order you will use them:

| field | why you care |
|---|---|
| `source` | `"podcastindex-live"` or `"fixture"`. **Check this first.** Never present fixture data as a real result |
| `shows[].latestEpisode.enclosureUrl` | the MP3. `curl -sLO` it and you have the audio |
| `shows[].latestEpisode.transcripts[]` | published transcript files. When non-empty, read these instead — an hour of audio is a 78 MB download and minutes of Whisper; its `.srt` is one GET |
| `shows[].feedId` / `latestEpisode.episodeId` | ids for follow-up calls |
| `shows[].url` | the raw RSS feed, if you would rather parse it yourself |
| `shows[].hasValueBlock` | the feed publishes a Podcasting 2.0 `<podcast:value>` block — the show itself accepts streaming micropayments |

A show with no items comes back with `latestEpisode: null`; the show entry is still there.

## 8. Turning on live data

Fixtures exist so this demo runs with zero signups. Real search needs Podcast Index
credentials, which are free and issued instantly:

1. Sign up at <https://api.podcastindex.org/signup>.
2. Put the pair in `.env`:

```bash
PODCAST_INDEX_KEY=your-key
PODCAST_INDEX_SECRET=your-secret
```

3. Restart, and confirm:

```bash
curl -s localhost:4028/health | jq .source
# "podcastindex-live"
```

Nothing else changes — same routes, same prices, same response shapes. Only `source` flips,
and the catalogue goes from three shows to about four million.

Auth is a SHA-1 of `key + secret + unixSeconds` sent as `Authorization` alongside
`X-Auth-Key` and `X-Auth-Date`; the server handles it. Your credentials never leave the
deployment — clients only ever see x402.

## 9. One episode in full

```bash
curl -s localhost:4028/episode/16795090960 -H "X-PAYMENT: $PAID" | jq .episode
```

Use this when you have an `episodeId` from a search and want the complete record — byte
length, season, GUID, the full transcript list. For the newest episode of a show you just
searched, you already have it; do not pay twice.

## 10. Going to mainnet

```bash
# EVM rail → Base mainnet
NETWORK=base
FACILITATOR_URL=https://your-mainnet-facilitator.example

# Solana rail → already mainnet by default
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_URL=https://your-rpc-provider.example

# your own addresses, or you are donating to the suite
PAY_TO_ADDRESS=0xYourMainnetAddress
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress

# so 402 challenges quote absolute public URLs
PUBLIC_BASE_URL=https://podcasts.yourdomain.com

# and real data
PODCAST_INDEX_KEY=...
PODCAST_INDEX_SECRET=...
```

`https://x402.org/facilitator` is a testnet convenience. For real money point
`FACILITATOR_URL` at a mainnet-capable facilitator (Coinbase CDP's, or your own) — it
verifies signatures and broadcasts settlement, so choose it as deliberately as a payment
processor.

Then list the deployment: submit your origin to [x402scan.com](https://x402scan.com), the
x402 Bazaar, and [agentic.market](https://agentic.market). They read `/.well-known/x402`,
which this server already serves.

## Next

- [API reference](api.md) — every field of every response
- [For AI agents](agents.md) — discovery, MCP, listing
- [`examples/curl.md`](https://github.com/nirholas/x402-podcasts/blob/main/examples/curl.md) — the protocol by hand
