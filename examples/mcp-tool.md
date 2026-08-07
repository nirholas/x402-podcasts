# Exposing x402-podcasts as an MCP tool

[Model Context Protocol](https://modelcontextprotocol.io) servers give Claude tools it can
call mid-conversation. Wrapping this service lets Claude *buy* a podcast search while you're
talking to it — and, more usefully, resolve a topic to a downloadable audio URL and a
transcript it can actually read.

## The server

```bash
npm install @modelcontextprotocol/sdk x402-fetch viem zod
```

`mcp-podcasts.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";
import { z } from "zod";

const BASE_URL = process.env.X402_PODCASTS_URL ?? "http://localhost:4028";

// One wallet, reused for every purchase. Its balance IS the spending cap.
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() })
  .extend(publicActions);
const pay = wrapFetchWithPayment(fetch, wallet as never);

const server = new McpServer({ name: "x402-podcasts", version: "0.1.0" });

server.tool(
  "search_podcasts",
  "Search ~4M podcast feeds by topic, show name or host. Returns matching shows with " +
    "metadata AND each show's newest episode including its audio URL. $0.002 USDC per " +
    "call, paid automatically. Check the `source` field: `fixture` means the deployment " +
    "has no Podcast Index credentials and the results are samples, not real search hits.",
  {
    q: z.string().describe("Search term — topic, show title, or host name"),
    max: z.number().int().min(1).max(20).optional().describe("How many shows (default 5)"),
  },
  async ({ q, max }) => {
    const url = `${BASE_URL}/search?q=${encodeURIComponent(q)}${max ? `&max=${max}` : ""}`;
    const res = await pay(url);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "get_podcast_episode",
  "Get the full record for one episode by its Podcast Index episodeId: audio enclosure " +
    "URL, byte length, duration, and any published transcript files. $0.002 USDC. " +
    "Prefer a transcript URL over downloading and transcribing the audio.",
  { episodeId: z.number().int().positive() },
  async ({ episodeId }) => {
    const res = await pay(`${BASE_URL}/episode/${episodeId}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

## Wiring it into Claude Desktop / Claude Code

`claude_desktop_config.json` (or `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "x402-podcasts": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-podcasts.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedTestnetKey",
        "X402_PODCASTS_URL": "https://your-deployment.example.com"
      }
    }
  }
}
```

Then:

> **You:** Find me a recent podcast episode about the Podcasting 2.0 namespace and summarise it.
>
> **Claude:** *(calls `search_podcasts` — $0.002 — finds the show and its latest episode,
> then `get_podcast_episode` — $0.002 — sees a `.srt` transcript, fetches that instead of the
> 78 MB MP3, and summarises it)*

That second step is the whole trick: `transcripts` turns an hour of audio into a text file
the model can read directly, for the price of one HTTP GET.

## Notes

- **Budget the wallet, not the tool.** Fund the MCP server's key with what you're willing to
  let the agent spend. That ceiling is the safety mechanism.
- **Search first, then resolve.** `search_podcasts` already includes each show's latest
  episode with its audio URL, so a second call is only needed for older episodes or full
  transcript lists.
- **Teach the model about `source`.** The tool description above does it: a `fixture`
  response must never be reported as a real search result.
- **Solana rail.** Swap `wrapFetchWithPayment` for a Solana x402 client if your agent's
  wallet lives on Solana; the service accepts either and the tool code is unchanged.
- **Discovery.** An agent that can read [`skill.md`](../skill.md) or `GET /.well-known/x402`
  can write this wrapper itself — that is what those files are for.
