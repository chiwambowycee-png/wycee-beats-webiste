import { getStore } from "@netlify/blobs";

const allowedSongs = new Set([
  "this-is-love",
  "edify-me",
  "handede",
  "black-handsome",
  "bad-slime",
  "my-heart-is-not-a-ball",
  "step-slow",
  "slow-mo",
  "timapanga-zimenezi",
]);

const keyFor = (song) => `downloads/${song}`;

async function readCount(store, key) {
  const result = await store.getWithMetadata(key, { consistency: "strong" });
  return result ? { count: Number(result.data) || 0, etag: result.etag } : { count: 0, etag: null };
}

export default async (request) => {
  const url = new URL(request.url);
  const song = url.searchParams.get("song") || "";

  if (!allowedSongs.has(song)) {
    return Response.json({ error: "Unknown song" }, { status: 400 });
  }

  const store = getStore("wycee-download-counts");
  const key = keyFor(song);

  if (request.method === "GET") {
    const { count } = await readCount(store, key);
    return Response.json({ song, count });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, POST" } });
  }

  // Optimistic concurrency: retry if another download updates the same song at the same time.
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await readCount(store, key);
    const next = current.count + 1;

    const result = current.etag
      ? await store.set(key, String(next), { onlyIfMatch: current.etag })
      : await store.set(key, String(next), { onlyIfNew: true });

    if (result.modified) {
      return Response.json({ song, count: next }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  return Response.json({ error: "Please try again" }, { status: 503 });
};
