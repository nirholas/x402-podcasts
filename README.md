<h1 align="center">x402-podcasts</h1>

<p align="center">
  <b>Search four million podcast feeds and get back a playable audio URL.</b><br>
  $0.002 per query. USDC on Base <i>or</i> Solana. No account, no key, no subscription.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="https://x402.org"><img alt="x402" src="https://img.shields.io/badge/protocol-x402-0052ff.svg"></a>
  <img alt="rails" src="https://img.shields.io/badge/USDC-Base%20%2B%20Solana-2775ca.svg">
  <a href="https://podcastindex.org"><img alt="Podcast Index" src="https://img.shields.io/badge/data-Podcast%20Index-6b46c1.svg"></a>
  <a href="https://nirholas.github.io/x402-podcasts/"><img alt="docs" src="https://img.shields.io/badge/docs-Pages-24292f.svg"></a>
</p>

---

## What you get

| Route | Price | What lands in the 200 body |
|---|---|---|
| `GET /search?q=…` | **$0.002** | Matching shows — title, author, description, feed URL, artwork, categories, episode count, language, Podcasting 2.0 value block — **each with its newest episode**, including the enclosure (audio) URL and any transcript files |
| `GET /episode/:id` | **$0.002** | The full record for one episode: audio URL, byte length, duration, episode/season numbers, artwork, transcripts, GUID, feed context |
| `GET /` · `/health` · `/skill.md` · `/.well-known/x402` · `/openapi.json` | free | Discovery, and which data source this deployment is serving |

Every paid route returns the purchased artifact **in the 200 body**. Nothing is queued.

## Why the enclosure URL matters

Most podcast APIs give you titles and descriptions. This one gives you `enclosureUrl` — the
actual MP3 — plus `transcripts[]`, the Podcasting 2.0 transcript files a feed publishes.

That is the difference between "here are some podcasts about X" and a pipeline: search →
audio URL → download, or better, search → transcript URL → read. An hour-long episode is a
78 MB download and several minutes of Whisper; its `.srt` is a few hundred kilobytes and one
HTTP GET. When `transcripts` is non-empty, take it.

## Why x402 for this

Podcast search is a spiky, occasional need — an agent researching a topic runs five queries
this week and none next month. The Podcast Index generously gives out free keys, but a key
is still an account, a secret to store, a rotation policy, and a per-deployment signup. x402
charges a fifth of a cent at the moment of the query, from a wallet the agent already has.
The overhead of *acquiring the right to ask* drops to zero.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-podcasts.git
cd x402-podcasts
npm install
cp .env.example .env      # already filled with working defaults
npm run dev               # http://localhost:4021
```

Ask without paying and you get the dual-rail challenge:

```bash
curl -i -s 'localhost:4021/search?q=podcasting%202.0'
# HTTP/1.1 402 Payment Required
# { "x402Version": 1, "accepts": [ {…base-sepolia…}, {…solana…} ] }
```

Pay and you get the results:

```bash
PRIVATE_KEY=0xyourTestnetKey Q="podcasting 2.0" npm run client
```

## How x402 works here

```
agent ──GET /search?q=linux───────────────▶ server
      ◀──402 + accepts:[ Base USDC, Solana USDC ]──
      (client picks a rail, signs $0.002)
      ──GET /search?q=linux + X-PAYMENT──▶ server
                                            ├─ facilitator: verify → settle
                                            └─ Podcast Index: search + newest episode per show
      ◀──200 + shows + audio URLs + X-PAYMENT-RESPONSE──
```

## Dual-rail payment: Base **or** Solana

Every 402 lists **two** payment requirements — USDC on Base (EIP-3009
`transferWithAuthorization`) and USDC on Solana (SPL `transferChecked`). The client picks
whichever chain it can sign on; the server settles either and returns the same artifact.

| | EVM rail | Solana rail |
|---|---|---|
| network | `base-sepolia` (default) / `base` | `solana` (default) / `solana-devnet` |
| asset | USDC `0x036CbD…dCF7e` (sepolia) | USDC mint `EPjFWdd5…TDt1v` |
| payTo | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |
| facilitator | `https://x402.org/facilitator` | `https://facilitator.payai.network` |

Those are the suite's public receive addresses and the server runs with them out of the box.
Set `PAY_TO_ADDRESS` / `SOLANA_PAY_TO_ADDRESS` to be paid yourself. The Solana network fee is
sponsored by the facilitator's fee payer, so a payer needs USDC only — no SOL.

## Real backend / API keys — and honest fixtures

The upstream is the [Podcast Index](https://podcastindex.org), the open catalogue behind
Podcasting 2.0. Its keys are free and instant, but they *are* keys, so this repo is
**env-gated**:

| `PODCAST_INDEX_KEY` + `PODCAST_INDEX_SECRET` | behaviour | `source` field |
|---|---|---|
| both set | every call hits the live API at request time | `"podcastindex-live"` |
| unset | deterministic samples are served so the demo runs with zero signups | `"fixture"` |

**Fixtures are labelled, not hidden.** Every paid response carries `source`, `GET /` and
`GET /health` report the current mode, and the service card lists the fixture episode ids so
you can exercise `/episode/:id` without keys. The fixture set is three real shows —
*Podcasting 2.0*, *Linux Unplugged*, *The Changelog* — with one episode each, filtered by
your query, so shapes and semantics are exactly what live mode returns.

Never present a `fixture` response as a real search result. Get free credentials at
<https://api.podcastindex.org/signup> and the same code goes live with no other change.

## For AI agents

- **[`skill.md`](skill.md)** — the agent-facing contract: endpoints, params, response
  schemas, payment, the `source` rule, error table. Point an agent at
  `https://your-host/skill.md` and it can use this service with no other documentation.
- **`GET /.well-known/x402`** — machine-readable manifest of every paid resource, its price,
  its input/output schema and both rails. This is the format
  [x402scan.com](https://x402scan.com), the **x402 Bazaar** and
  [agentic.market](https://agentic.market) index.
- **MCP** — [`examples/mcp-tool.md`](examples/mcp-tool.md) exposes `search_podcasts` and
  `get_podcast_episode` as Model Context Protocol tools, so Claude can find an episode and
  read its transcript mid-conversation.
- **Client** — [`examples/agent-client.ts`](examples/agent-client.ts) runs the full flow:
  402 → pay → search → resolve an episode to audio.

## Docs

Full site: **<https://nirholas.github.io/x402-podcasts/>**

- [Tutorial](docs/tutorial.md) — install → 402 → paid search → audio → live keys → mainnet
- [API reference](docs/api.md) — every field of every response
- [For agents](docs/agents.md) — discovery, payment, MCP, listing

## Support

Questions, bugs, or a listing request: **nichxbt@gmail.com** or open an issue.

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## License

Apache-2.0 — see [LICENSE](LICENSE). Podcast data is served by the Podcast Index under its
own terms; this repo does not redistribute their catalogue.
