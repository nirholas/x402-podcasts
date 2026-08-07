# For AI agents

This service turns "find me a podcast about X" into a URL you can download, or better, a
transcript you can read. An agent with a wallet needs no signup, no key, and no human in the
loop.

## 1. Discover

Two free, unauthenticated files describe everything.

**`GET /skill.md`** — the agent-facing contract: endpoints, params, response schemas,
payment instructions, the `source` rule, and the error table. Drop the URL into a system
prompt or retrieval index and a model can use the service correctly with no other
documentation. This is the [agentres.dev](https://agentres.dev) `skill.md` pattern; the
format is specified by [`x402-skill-md`](https://github.com/nirholas/x402-skill-md).

**`GET /.well-known/x402`** — the machine-readable manifest:

```jsonc
{
  "x402Version": 1,
  "name": "x402-podcasts",
  "upstream": { "name": "Podcast Index", "auth": "free key, env-gated" },
  "rails": [
    { "rail": "evm",    "network": "base-sepolia", "asset": "USDC", "payTo": "0x40252CF…2402" },
    { "rail": "solana", "network": "solana",       "asset": "USDC", "payTo": "WwwuGbqH…T3WwW" }
  ],
  "resources": [
    { "resource": "GET /search", "price": "$0.002",
      "inputSchema":  { "required": ["q"], "…": {} },
      "outputSchema": { "required": ["query", "source", "count", "shows"], "…": {} },
      "accepts": [ { "network": "base-sepolia", … }, { "network": "solana", … } ] }
  ]
}
```

Plan against `outputSchema` before spending; budget against `price`.

**`GET /`** — also free, and worth one call before you spend anything: it reports whether
this deployment is serving live Podcast Index data or fixtures, and in fixture mode lists
the episode ids that exist.

**`GET /openapi.json`** — OpenAPI 3.1, if your framework prefers a generated client.

## 2. Pay

Every paid route answers an unpaid request with 402 and a **dual-rail** `accepts` array:
USDC on Base, USDC on Solana, same price, same artifact. Pick whichever chain your wallet
lives on — the server has no preference.

**EVM rail** — sign an EIP-3009 `transferWithAuthorization`:

```ts
import { wrapFetchWithPayment } from "x402-fetch";
const pay = wrapFetchWithPayment(fetch, wallet);       // viem wallet client
const res = await pay(`${BASE}/search?q=${encodeURIComponent(topic)}`);
const { shows, source } = await res.json();
```

**Solana rail** — build and sign the SPL transfer, then send the envelope:

```ts
import { prepareSolanaCheckout, encodeX402Payment } from "@three-ws/x402-payment-modal/server";

const accept = challenge.accepts.find((a) => a.network.startsWith("solana"));
const { tx_base64 } = await prepareSolanaCheckout({ accept, buyer: pubkey });
const { x_payment } = encodeX402Payment({
  accept,
  signedTxBase64: await wallet.signTransaction(tx_base64),
  resourceUrl: url,
});
await fetch(url, { headers: { "X-PAYMENT": x_payment } });
```

Those helpers only *build and encode* the payment client-side. Verification and settlement
happen server-side through the x402 facilitator, on both rails.
`accept.extra.feePayer` sponsors the SOL network fee, so an agent holding only USDC can pay.

### Reading the contract before you pay

Every entry in `accepts` carries an `outputSchema` with two halves, so an agent can judge
whether a call is worth its price and then make it correctly — without fetching the OpenAPI
document first:

- **`outputSchema.input`** — `{ type: "http", method, queryParams?, pathParams?, bodyType?,
  bodyFields? }`. Each value is the JSON Schema for that query parameter, path segment or
  request-body field.
- **`outputSchema.output`** — the JSON Schema of the 200 body you receive once payment
  settles.

Both halves are generated from `openapi.json`, so the runtime challenge and the published
spec cannot drift apart. Both rails advertise the identical contract: which wallet you pay
with never changes what the endpoint takes or returns.

You can probe a paid route safely: the paywall answers before any validation or existence
check, so an unpaid request with a synthetic id or an empty body still returns the full
challenge rather than a 404 or a 400. Read the price and the contract first, decide, then pay.

### Protocol version

This service speaks **x402 v1** (`x402Version: 1`) — the version every client shipped in this
repo, and in the examples above, is written against. v2 relocates the invocation contract to
`extensions.bazaar.schema` and identifies networks with CAIP-2 ids; agentcash prefers it, and
moving is a planned upgrade once the clients here can speak both. Until then, read `accepts[]`
and ignore `extensions`.

## 3. What you get

The 200 body **is** the purchase — no job id, no webhook, nothing to poll:

```json
{
  "query": "podcasting 2.0",
  "source": "podcastindex-live",
  "count": 1,
  "shows": [{
    "title": "Podcasting 2.0",
    "feedId": 920666,
    "url": "https://mp3s.nashownotes.com/pc20rss.xml",
    "latestEpisode": {
      "episodeId": 16795090960,
      "title": "Episode 180: The Namespace Grows Up",
      "enclosureUrl": "https://op3.dev/e/mp3s.nashownotes.com/PC20-180.mp3",
      "enclosureLength": 78720000,
      "transcripts": [{ "url": "https://…/PC20-180.srt", "type": "application/srt" }]
    }
  }],
  "searchedAt": "2026-08-07T12:00:00.000Z"
}
```

Plus `X-PAYMENT-RESPONSE`, a base64 receipt naming the rail, network and transaction — keep
it to reconcile spend.

### Rules worth encoding in your agent

- **Check `source` first.** `"fixture"` means the deployment has no Podcast Index
  credentials and the results are samples. Never report them as real search hits. Call
  `GET /` (free) before your first paid call if you need to know in advance.
- **Prefer `transcripts` over `enclosureUrl`.** A non-empty `transcripts` array is a text
  file you can read directly. The MP3 alternative is a ~78 MB download and minutes of
  transcription for the same information.
- **Check `enclosureLength` before downloading.** It is in bytes, and podcasts are large.
- **Do not pay twice for the same episode.** `/search` already embeds each show's newest
  episode in full — including the audio URL. `/episode/:id` is for *older* episodes or ids
  you got elsewhere.
- **Ask for what you need.** `max` is clamped to 1–20, and in live mode the route makes one
  upstream call per show returned. The price is flat, but latency is not.
- **`latestEpisode` can be `null`.** A feed with no items, or whose episode lookup failed,
  still returns its show entry. Handle it.

## 4. MCP integration

[`examples/mcp-tool.md`](https://github.com/nirholas/x402-podcasts/blob/main/examples/mcp-tool.md)
is a complete Model Context Protocol server exposing `search_podcasts` and
`get_podcast_episode`. The wallet lives in the MCP process, so its balance is the agent's
spending cap — fund it with what you are willing to lose.

```json
{
  "mcpServers": {
    "x402-podcasts": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-podcasts.ts"],
      "env": { "PRIVATE_KEY": "0x…", "X402_PODCASTS_URL": "https://your-host" }
    }
  }
}
```

The pattern that makes it worth the two cents: search → find a transcript URL → fetch and
summarise, without ever downloading audio.

## 5. Getting listed

Deploy publicly, then submit the origin to the x402 discovery surfaces. Each reads
`/.well-known/x402`:

| where | what it does | how |
|---|---|---|
| [x402scan.com](https://x402scan.com) | indexes live x402 endpoints and their settlement volume | submit your origin; it crawls `/.well-known/x402` |
| **x402 Bazaar** | the protocol's own resource directory, queried by agents at runtime | register through the facilitator's `list` API |
| [agentic.market](https://agentic.market) | marketplace of agent-payable services | submit the origin plus your `skill.md` URL |

Before submitting, confirm these resolve over HTTPS on your public origin, set
`PUBLIC_BASE_URL` so 402 challenges quote absolute public URLs, and set your Podcast Index
credentials — a listed service serving fixtures is worse than no listing:

```
https://your-host/.well-known/x402
https://your-host/skill.md
https://your-host/openapi.json
```

Questions or a listing problem: **nichxbt@gmail.com**.
