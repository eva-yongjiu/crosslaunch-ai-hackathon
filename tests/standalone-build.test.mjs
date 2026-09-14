import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import test from "node:test";

test("standalone output contains the browser assets required for button interactions", async () => {
  const standalone = new URL("../dist/standalone/", import.meta.url);
  await access(new URL("server.js", standalone));
  await access(new URL("dist/server/", standalone));

  const chunkDirectory = new URL("dist/client/_next/static/chunks/", standalone);
  const chunks = await readdir(chunkDirectory);
  assert.ok(chunks.some((file) => /^index-.*\.js$/.test(file)), "standalone build is missing the client index chunk");
});
