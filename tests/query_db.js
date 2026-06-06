import { appConfig } from "../dist/utils/config.js";

async function run() {
  const guid = "plex://movie/5d77705edd931c001e38bde2";
  const url = new URL("/library/all", appConfig.PLEX_BASE_URL);
  url.searchParams.set("X-Plex-Token", appConfig.PLEX_TOKEN);
  url.searchParams.set("guid", guid);
  const res = await fetch(url);
  console.log("Search GUID status:", res.status);
  const xml = await res.text();
  console.log("Search GUID XML response:\n", xml);
}
run();
