export default async function globalSetup() {
  process.env.PLEX_MUTATION_MODE = "mock";
  process.env.DISCORD_ENABLED = "false";
  process.env.TAUTULLI_API_KEY = "";

  const fixture = await import("./fixture-server.mjs");
  await fixture.ready;
  return async () => fixture.stopFixtureServer();
}
