import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  paywall,
  activeRails,
  usingSuiteDefaultPayTo,
  paymentReceipt,
  type RoutePrices,
} from "./payments.js";
import {
  searchShows,
  getEpisode,
  currentSource,
  liveMode,
  fixtureEpisodeIds,
  PodcastError,
} from "./podcastindex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 4021);

const PAID_ROUTES: RoutePrices = {
  "GET /search": "$0.002",
  "GET /episode/:id": "$0.002",
};

const DESCRIPTIONS: Record<string, string> = {
  "GET /search": "Podcast search: matching shows with metadata and each one's latest episode",
  "GET /episode/:id": "Full episode detail including the enclosure (audio) URL and transcripts",
};

const PRICE_TABLE = [
  { route: "GET /search?q=…", price: "$0.002" },
  { route: "GET /episode/:id", price: "$0.002" },
];

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));

// ---- free routes ----
app.get("/", (_req, res) => {
  res.json({
    name: "x402-podcasts",
    description: "Podcast search and episode intel over the Podcast Index API, per query",
    docs: "https://nirholas.github.io/x402-podcasts/",
    skill: "/skill.md",
    manifest: "/.well-known/x402",
    openapi: "/openapi.json",
    payment: {
      protocol: "x402",
      note: "Pay in USDC on Base or Solana — your client picks the rail.",
      rails: activeRails(),
    },
    dataSource: {
      source: currentSource(),
      live: liveMode(),
      note: liveMode()
        ? "Live Podcast Index API — every response is fetched at request time."
        : "Fixture mode: PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET are unset, so responses are deterministic samples labelled source:\"fixture\". Free keys: https://api.podcastindex.org/signup",
      ...(liveMode() ? {} : { fixtureEpisodeIds: fixtureEpisodeIds() }),
    },
    endpoints: PRICE_TABLE,
  });
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), source: currentSource() }),
);
app.get("/.well-known/x402", (_req, res) =>
  res.type("application/json").sendFile(path.join(ROOT, "public", ".well-known", "x402")),
);
app.get("/skill.md", (_req, res) => res.type("text/markdown").sendFile(path.join(ROOT, "skill.md")));
app.get("/openapi.json", (_req, res) => res.sendFile(path.join(ROOT, "openapi.json")));
app.use(express.static(path.join(ROOT, "public")));

// ---- paywall: everything below this line costs USDC ----
app.use(paywall(PAID_ROUTES, { service: "x402-podcasts", descriptions: DESCRIPTIONS }));

/**
 * GET /search?q=…&max=… — $0.002
 * The purchased artifact is the result set itself, in this response body.
 */
app.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "");
    const max = req.query.max === undefined ? 5 : Number(req.query.max);
    if (!Number.isFinite(max)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "max must be a number (1-20)" });
      return;
    }
    const result = await searchShows(q, max);
    res.json({ ...result, receipt: paymentReceipt(res) });
  } catch (err) {
    if (err instanceof PodcastError) {
      res.status(err.status).json({ error: err.code, message: err.message });
    } else {
      res.status(500).json({ error: "INTERNAL", message: String(err) });
    }
  }
});

/**
 * GET /episode/:id — $0.002
 * Full episode record, enclosure URL included, in this response body.
 */
app.get("/episode/:id", async (req, res) => {
  try {
    const result = await getEpisode(req.params.id);
    res.json({ ...result, receipt: paymentReceipt(res) });
  } catch (err) {
    if (err instanceof PodcastError) {
      res.status(err.status).json({ error: err.code, message: err.message });
    } else {
      res.status(500).json({ error: "INTERNAL", message: String(err) });
    }
  }
});

app.listen(PORT, () => {
  console.log(`\nx402-podcasts listening on http://localhost:${PORT}`);
  console.log("Payment rails (USDC — the client picks):");
  for (const r of activeRails()) {
    console.log(`  ${r.rail.padEnd(7)} ${r.network.padEnd(14)} → ${r.payTo}  via ${r.facilitator}`);
  }
  if (usingSuiteDefaultPayTo()) {
    console.log(
      "  note: using suite default payTo — set PAY_TO_ADDRESS / SOLANA_PAY_TO_ADDRESS to receive funds yourself",
    );
  }
  console.log(
    `Data source: ${
      liveMode()
        ? "Podcast Index (live)"
        : 'fixtures — set PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET for live data (free key: https://api.podcastindex.org/signup)'
    }`,
  );
  console.log("Paid routes:");
  for (const r of PRICE_TABLE) console.log(`  ${r.route.padEnd(24)} ${r.price}`);
  console.log(
    "Free routes: GET /  GET /health  GET /skill.md  GET /.well-known/x402  GET /openapi.json\n",
  );
});
