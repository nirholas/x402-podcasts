/**
 * examples/agent-client.ts — search, then resolve an episode to audio, paid.
 *
 *   PRIVATE_KEY=0x… Q="podcasting 2.0" npm run client
 *
 * `wrapFetchWithPayment` catches each 402, picks the EVM requirement out of the
 * dual-rail `accepts` array, signs an EIP-3009 authorisation for the exact
 * amount, and retries with `X-PAYMENT`. The Solana rail is shown at the bottom.
 */
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4028";
const QUERY = process.env.Q ?? "podcasting 2.0";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;

async function showChallenge(): Promise<void> {
  const url = `${BASE_URL}/search?q=${encodeURIComponent(QUERY)}`;
  console.log(`\n① Unpaid request → expect a dual-rail 402\n   GET ${url}`);
  const res = await fetch(url);
  const body = await res.json();
  console.log(`   HTTP ${res.status}`);
  for (const a of body.accepts ?? []) {
    console.log(
      `   accepts: ${String(a.network).padEnd(14)} ${a.maxAmountRequired} base units USDC → ${a.payTo}`,
    );
  }
}

async function main(): Promise<void> {
  // The free service card tells you whether this deployment is live or on fixtures.
  const card = await (await fetch(`${BASE_URL}/`)).json();
  console.log(`data source: ${card.dataSource?.source} — ${card.dataSource?.note}`);

  await showChallenge();

  if (!PRIVATE_KEY) {
    console.log(
      "\nSet PRIVATE_KEY to a funded Base Sepolia wallet to complete the purchase." +
        "\nTestnet USDC faucet: https://faucet.circle.com\n",
    );
    return;
  }

  const chain = process.env.NETWORK === "base" ? base : baseSepolia;
  const account = privateKeyToAccount(PRIVATE_KEY);
  const wallet = createWalletClient({ account, chain, transport: http() }).extend(publicActions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pay = wrapFetchWithPayment(fetch, wallet as any);

  console.log(`\n② Paying from ${account.address} on ${chain.name} — $0.002 per call`);

  // --- search -------------------------------------------------------------
  const found = await pay(`${BASE_URL}/search?q=${encodeURIComponent(QUERY)}&max=3`);
  const results = await found.json();
  console.log(`\n③ 200 — ${results.count} show(s) for "${results.query}" (source: ${results.source})`);
  for (const show of results.shows ?? []) {
    console.log(`\n   ${show.title} — ${show.author ?? "unknown author"}`);
    console.log(`   feedId ${show.feedId} · ${show.episodeCount ?? "?"} episodes · ${show.categories.join(", ")}`);
    if (show.latestEpisode) {
      const ep = show.latestEpisode;
      console.log(`   latest: #${ep.episodeNumber ?? "?"} ${ep.title}`);
      console.log(`           ${ep.enclosureUrl ?? "(no audio url)"}`);
      if (ep.transcripts?.length) console.log(`           transcript: ${ep.transcripts[0].url}`);
    }
  }

  const receiptHeader = found.headers.get("x-payment-response");
  if (receiptHeader) console.log(`\n   X-PAYMENT-RESPONSE:`, decodeXPaymentResponse(receiptHeader));

  // --- one episode in full ------------------------------------------------
  const episodeId = results.shows?.[0]?.latestEpisode?.episodeId;
  if (!episodeId) {
    console.log("\n④ No episode id in the results — nothing to resolve.");
    return;
  }

  console.log(`\n④ Resolving episode ${episodeId} in full — $0.002`);
  const detail = await pay(`${BASE_URL}/episode/${episodeId}`);
  const { episode, source } = await detail.json();
  console.log(`   ${episode.feedTitle} — ${episode.title}   (source: ${source})`);
  console.log(`   published ${episode.datePublished}, ${Math.round((episode.durationSeconds ?? 0) / 60)} min`);
  console.log(`   audio: ${episode.enclosureUrl}`);
  console.log(`   bytes: ${episode.enclosureLength ?? "unknown"} · type: ${episode.enclosureType}`);
  if (episode.transcripts.length) {
    console.log(`   transcripts: ${episode.transcripts.map((t: { url: string }) => t.url).join(", ")}`);
    console.log("   → read the transcript instead of transcribing the audio; it is far cheaper.");
  }
}

main().catch((err) => {
  console.error("\nfailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

/* ---------------------------------------------------------------------------
 * Paying on the SOLANA rail instead
 * ---------------------------------------------------------------------------
 * The same 402 carries a `solana` entry. Pick it, build the SPL transferChecked
 * to `payTo` for `maxAmountRequired` base units of the USDC mint, sign it, and
 * base64 the x402 envelope into `X-PAYMENT`:
 *
 *   import {
 *     prepareSolanaCheckout,
 *     encodeX402Payment,
 *   } from "@three-ws/x402-payment-modal/server";
 *
 *   const url       = `${BASE_URL}/search?q=linux`;
 *   const challenge = await (await fetch(url)).json();
 *   const accept    = challenge.accepts.find((a: any) => a.network.startsWith("solana"));
 *
 *   const { tx_base64 } = await prepareSolanaCheckout({ accept, buyer: myPubkey });
 *   const signed        = await wallet.signTransaction(tx_base64);   // Phantom, Solflare, a keypair
 *   const { x_payment } = encodeX402Payment({ accept, signedTxBase64: signed, resourceUrl: url });
 *
 *   const res = await fetch(url, { headers: { "X-PAYMENT": x_payment } });
 *
 * `accept.extra.feePayer` sponsors the SOL network fee, so the buyer spends USDC only.
 *
 * ---------------------------------------------------------------------------
 * The raw dual-rail 402, for reference
 * ---------------------------------------------------------------------------
 *   $ curl -s 'localhost:4028/search?q=linux' | jq '.accepts[] | {network, payTo, maxAmountRequired}'
 *   { "network": "base-sepolia", "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "2000" }
 *   { "network": "solana",       "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "2000" }
 */
