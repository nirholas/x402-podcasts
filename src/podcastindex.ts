/**
 * Podcast Index API client.
 *
 * The Podcast Index (https://podcastindex.org) is the open index behind the
 * Podcasting 2.0 ecosystem — an independent catalogue of ~4 million feeds. Keys
 * are free but they are keys, so this module is **env-gated**: when
 * `PODCAST_INDEX_KEY` and `PODCAST_INDEX_SECRET` are both set every call hits
 * the live API; otherwise deterministic fixtures are served and every response
 * is stamped `source: "fixture"`. The demo therefore runs with zero signups.
 *
 * Auth is a SHA-1 of `key + secret + unixSeconds` sent as `Authorization`,
 * alongside `X-Auth-Key` and `X-Auth-Date`.
 */
import { createHash } from "node:crypto";

const API = "https://api.podcastindex.org/api/1.0";
const UA = "x402-podcasts/0.1.0 (+https://github.com/nirholas/x402-podcasts)";

export type Source = "podcastindex-live" | "fixture";

export class PodcastError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** True when both credentials are present — the only thing that turns on live mode. */
export function liveMode(): boolean {
  return Boolean(process.env.PODCAST_INDEX_KEY && process.env.PODCAST_INDEX_SECRET);
}

export function currentSource(): Source {
  return liveMode() ? "podcastindex-live" : "fixture";
}

function authHeaders(): Record<string, string> {
  const key = process.env.PODCAST_INDEX_KEY!;
  const secret = process.env.PODCAST_INDEX_SECRET!;
  const date = Math.floor(Date.now() / 1000).toString();
  return {
    "User-Agent": UA,
    "X-Auth-Key": key,
    "X-Auth-Date": date,
    Authorization: createHash("sha1").update(key + secret + date).digest("hex"),
  };
}

async function call(path: string, timeoutMs = 12_000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      headers: authHeaders(),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new PodcastError(
        "PODCAST_INDEX_AUTH_FAILED",
        "Podcast Index rejected the credentials — check PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET",
        502,
      );
    }
    if (res.status === 429) {
      throw new PodcastError("PODCAST_INDEX_RATE_LIMITED", "Podcast Index rate limit hit", 502);
    }
    if (!res.ok) {
      throw new PodcastError("PODCAST_INDEX_ERROR", `Podcast Index returned HTTP ${res.status}`, 502);
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof PodcastError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new PodcastError("PODCAST_INDEX_TIMEOUT", "Podcast Index did not respond in time", 504);
    }
    throw new PodcastError("PODCAST_INDEX_ERROR", (err as Error).message, 502);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface Show {
  feedId: number;
  title: string;
  author: string | null;
  description: string | null;
  url: string | null;
  link: string | null;
  image: string | null;
  language: string | null;
  categories: string[];
  episodeCount: number | null;
  lastUpdate: string | null;
  explicit: boolean;
  /** Podcasting 2.0 value block — set when the show accepts streaming payments. */
  hasValueBlock: boolean;
}

export interface Episode {
  episodeId: number;
  feedId: number | null;
  feedTitle: string | null;
  title: string;
  description: string | null;
  datePublished: string | null;
  durationSeconds: number | null;
  /** The audio file itself — this is the thing an agent actually wants. */
  enclosureUrl: string | null;
  enclosureType: string | null;
  enclosureLength: number | null;
  episodeNumber: number | null;
  season: number | null;
  explicit: boolean;
  image: string | null;
  link: string | null;
  /** Transcript files published by the feed (Podcasting 2.0 `<podcast:transcript>`). */
  transcripts: { url: string; type: string }[];
  guid: string | null;
}

const iso = (unixSeconds: unknown): string | null =>
  typeof unixSeconds === "number" && unixSeconds > 0
    ? new Date(unixSeconds * 1000).toISOString()
    : null;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function normaliseShow(f: Record<string, any>): Show {
  const cats = f.categories && typeof f.categories === "object" ? Object.values(f.categories) : [];
  return {
    feedId: Number(f.id ?? 0),
    title: String(f.title ?? "").trim(),
    author: str(f.author) ?? str(f.ownerName),
    description: str(f.description),
    url: str(f.url),
    link: str(f.link),
    image: str(f.artwork) ?? str(f.image),
    language: str(f.language),
    categories: cats.filter((c): c is string => typeof c === "string"),
    episodeCount: typeof f.episodeCount === "number" ? f.episodeCount : null,
    lastUpdate: iso(f.newestItemPubdate ?? f.lastUpdateTime),
    explicit: Boolean(f.explicit),
    hasValueBlock: Boolean(f.value),
  };
}

function normaliseEpisode(e: Record<string, any>): Episode {
  const transcripts = Array.isArray(e.transcripts)
    ? e.transcripts
        .filter((t: any) => t && typeof t.url === "string")
        .map((t: any) => ({ url: t.url as string, type: String(t.type ?? "unknown") }))
    : [];
  return {
    episodeId: Number(e.id ?? 0),
    feedId: typeof e.feedId === "number" ? e.feedId : null,
    feedTitle: str(e.feedTitle),
    title: String(e.title ?? "").trim(),
    description: str(e.description),
    datePublished: iso(e.datePublished),
    durationSeconds: typeof e.duration === "number" && e.duration > 0 ? e.duration : null,
    enclosureUrl: str(e.enclosureUrl),
    enclosureType: str(e.enclosureType),
    enclosureLength: typeof e.enclosureLength === "number" ? e.enclosureLength : null,
    episodeNumber: typeof e.episode === "number" ? e.episode : null,
    season: typeof e.season === "number" ? e.season : null,
    explicit: e.explicit === 1 || e.explicit === true,
    image: str(e.image) ?? str(e.feedImage),
    link: str(e.link),
    transcripts,
    guid: str(e.guid),
  };
}

// ---------------------------------------------------------------------------
// Fixtures — used when PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET are unset.
// Deterministic, clearly labelled `source: "fixture"` in every response, and
// derived from real public feeds so the shapes are honest.
// ---------------------------------------------------------------------------

const FIXTURE_SHOWS: Show[] = [
  {
    feedId: 920666,
    title: "Podcasting 2.0",
    author: "Podcast Index LLC",
    description:
      "The Podcast Index development team talks about the open podcasting namespace, value-for-value, and the week in podcasting.",
    url: "https://mp3s.nashownotes.com/pc20rss.xml",
    link: "http://podcastindex.org/podcast/920666",
    image: "https://noagendaassets.com/enc/1611334858.921_pci_avatar.jpg",
    language: "en",
    categories: ["Technology", "News"],
    episodeCount: 180,
    lastUpdate: "2026-07-31T18:00:00.000Z",
    explicit: false,
    hasValueBlock: true,
  },
  {
    feedId: 41504,
    title: "Linux Unplugged",
    author: "Jupiter Broadcasting",
    description:
      "An open show powered by community LINUX Unplugged takes the best parts of open source and turns them into a weekly conversation.",
    url: "https://feeds.fireside.fm/linuxunplugged/rss",
    link: "https://linuxunplugged.com",
    image: "https://assets.fireside.fm/file/fireside-images/podcasts/images/f/f31a453c/cover.jpg",
    language: "en",
    categories: ["Technology"],
    episodeCount: 590,
    lastUpdate: "2026-08-04T02:00:00.000Z",
    explicit: false,
    hasValueBlock: true,
  },
  {
    feedId: 745392,
    title: "The Changelog",
    author: "Changelog Media",
    description: "Conversations with the hackers, leaders, and innovators of software development.",
    url: "https://changelog.com/podcast/feed",
    link: "https://changelog.com/podcast",
    image: "https://cdn.changelog.com/uploads/covers/podcast-original.png",
    language: "en",
    categories: ["Technology", "News"],
    episodeCount: 620,
    lastUpdate: "2026-08-05T09:30:00.000Z",
    explicit: false,
    hasValueBlock: false,
  },
];

const FIXTURE_EPISODES: Record<number, Episode[]> = {
  920666: [
    {
      episodeId: 16795090960,
      feedId: 920666,
      feedTitle: "Podcasting 2.0",
      title: "Episode 180: The Namespace Grows Up",
      description:
        "Adam and Dave walk through the newest tags in the podcast namespace and what apps have shipped support.",
      datePublished: "2026-07-31T18:00:00.000Z",
      durationSeconds: 4920,
      enclosureUrl: "https://op3.dev/e/mp3s.nashownotes.com/PC20-180-2026-07-31-Final.mp3",
      enclosureType: "audio/mpeg",
      enclosureLength: 78_720_000,
      episodeNumber: 180,
      season: null,
      explicit: false,
      image: "https://noagendaassets.com/enc/1611334858.921_pci_avatar.jpg",
      link: "http://podcastindex.org/podcast/920666",
      transcripts: [
        {
          url: "https://mp3s.nashownotes.com/PC20-180-2026-07-31-Final.srt",
          type: "application/srt",
        },
      ],
      guid: "PC20-180-2026-07-31",
    },
  ],
  41504: [
    {
      episodeId: 16795091422,
      feedId: 41504,
      feedTitle: "Linux Unplugged",
      title: "Episode 590: Immutable Ambitions",
      description: "We put three immutable desktops through a week of real work and report back.",
      datePublished: "2026-08-04T02:00:00.000Z",
      durationSeconds: 3780,
      enclosureUrl: "https://aphid.fireside.fm/.../linuxunplugged-590.mp3",
      enclosureType: "audio/mpeg",
      enclosureLength: 60_480_000,
      episodeNumber: 590,
      season: null,
      explicit: false,
      image: "https://assets.fireside.fm/file/fireside-images/podcasts/images/f/f31a453c/cover.jpg",
      link: "https://linuxunplugged.com/590",
      transcripts: [],
      guid: "5f0b9c1e-590",
    },
  ],
  745392: [
    {
      episodeId: 16795092001,
      feedId: 745392,
      feedTitle: "The Changelog",
      title: "Episode 620: Paying for APIs one request at a time",
      description: "What happens to software distribution when agents can pay per call?",
      datePublished: "2026-08-05T09:30:00.000Z",
      durationSeconds: 4260,
      enclosureUrl: "https://cdn.changelog.com/uploads/podcast/620/the-changelog-620.mp3",
      enclosureType: "audio/mpeg",
      enclosureLength: 68_160_000,
      episodeNumber: 620,
      season: null,
      explicit: false,
      image: "https://cdn.changelog.com/uploads/covers/podcast-original.png",
      link: "https://changelog.com/podcast/620",
      transcripts: [
        { url: "https://changelog.com/podcast/620/transcript.json", type: "application/json" },
      ],
      guid: "changelog-620",
    },
  ],
};

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface SearchResult {
  query: string;
  source: Source;
  count: number;
  shows: (Show & { latestEpisode: Episode | null })[];
  searchedAt: string;
}

/** Search shows by term and attach each one's most recent episode. */
export async function searchShows(query: string, max = 5): Promise<SearchResult> {
  const q = query.trim();
  if (!q) throw new PodcastError("BAD_REQUEST", "q is required", 400);
  if (q.length > 200) throw new PodcastError("BAD_REQUEST", "q must be 200 characters or fewer", 400);
  const limit = Math.min(Math.max(max, 1), 20);
  const searchedAt = new Date().toISOString();

  if (!liveMode()) {
    const needle = q.toLowerCase();
    const matched = FIXTURE_SHOWS.filter(
      (s) =>
        s.title.toLowerCase().includes(needle) ||
        (s.author ?? "").toLowerCase().includes(needle) ||
        (s.description ?? "").toLowerCase().includes(needle) ||
        s.categories.some((c) => c.toLowerCase().includes(needle)),
    );
    const shows = (matched.length ? matched : FIXTURE_SHOWS).slice(0, limit);
    return {
      query: q,
      source: "fixture",
      count: shows.length,
      shows: shows.map((s) => ({ ...s, latestEpisode: FIXTURE_EPISODES[s.feedId]?.[0] ?? null })),
      searchedAt,
    };
  }

  const body = await call(`/search/byterm?q=${encodeURIComponent(q)}&max=${limit}`);
  const feeds = Array.isArray(body.feeds) ? (body.feeds as Record<string, any>[]) : [];
  const shows = feeds.slice(0, limit).map(normaliseShow);

  // One extra call per show for its newest episode — the whole point of the route.
  const withLatest = await Promise.all(
    shows.map(async (show) => {
      try {
        const ep = await call(`/episodes/byfeedid?id=${show.feedId}&max=1`);
        const items = Array.isArray(ep.items) ? (ep.items as Record<string, any>[]) : [];
        return { ...show, latestEpisode: items[0] ? normaliseEpisode(items[0]) : null };
      } catch {
        return { ...show, latestEpisode: null };
      }
    }),
  );

  return { query: q, source: "podcastindex-live", count: withLatest.length, shows: withLatest, searchedAt };
}

export interface EpisodeResult {
  source: Source;
  episode: Episode;
  fetchedAt: string;
}

/** Full episode detail including the enclosure (audio) URL. */
export async function getEpisode(id: string): Promise<EpisodeResult> {
  const episodeId = Number(id);
  if (!Number.isInteger(episodeId) || episodeId <= 0) {
    throw new PodcastError("BAD_REQUEST", `"${id}" is not a Podcast Index episode id`, 400);
  }
  const fetchedAt = new Date().toISOString();

  if (!liveMode()) {
    const episode = Object.values(FIXTURE_EPISODES)
      .flat()
      .find((e) => e.episodeId === episodeId);
    if (!episode) {
      throw new PodcastError(
        "EPISODE_NOT_FOUND",
        `No fixture episode with id ${episodeId}. Fixture ids: ${Object.values(FIXTURE_EPISODES)
          .flat()
          .map((e) => e.episodeId)
          .join(", ")}. Set PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET for live lookups.`,
        404,
      );
    }
    return { source: "fixture", episode, fetchedAt };
  }

  const body = await call(`/episodes/byid?id=${episodeId}`);
  const item = (body.episode ?? null) as Record<string, any> | null;
  if (!item || !item.id) {
    throw new PodcastError("EPISODE_NOT_FOUND", `Podcast Index has no episode ${episodeId}`, 404);
  }
  return { source: "podcastindex-live", episode: normaliseEpisode(item), fetchedAt };
}

/** Fixture ids, surfaced on the free service card so the demo is discoverable. */
export function fixtureEpisodeIds(): number[] {
  return Object.values(FIXTURE_EPISODES).flat().map((e) => e.episodeId);
}
