// Manual verification of the TradingView endpoint and parser.
//
// Weekend / market closed: run mechanical mode (default). It drops the
// premarket_change filter so the request, parsing, and column-index mapping can
// be checked even when premarket_change returns empty.
//   npm run scan:tv
//
// Trading day, US pre-market: verify the real >90% filter.
//   npm run scan:tv -- --premarket
import fs from "fs";
import path from "path";
import { fetchScan } from "../lib/tradingview";

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const projectRoot = path.resolve(__dirname, "..");
loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));

const tvSessionId = process.env.TV_SESSION_ID;
const tvSessionSign = process.env.TV_SESSION_SIGN;
if (!tvSessionId || !tvSessionSign) {
  console.error(
    "Missing TV_SESSION_ID or TV_SESSION_SIGN env vars. Load them from .env.local or export them before running the test script.",
  );
  process.exit(1);
}

async function main() {
  const premarket = process.argv.includes("--premarket");
  const mode = premarket ? "premarket (filter >90%)" : "mechanical (no premarket filter)";
  console.log(`Running TradingView test in ${mode} mode...`);

  const rows = await fetchScan(
    premarket
      ? { includePremarketFilter: true, range: [0, 100] }
      : { includePremarketFilter: false, range: [0, 10] },
  );

  console.log(`Parsed ${rows.length} rows. First few:`);
  for (const r of rows.slice(0, 10)) {
    console.log(
      `${r.exchange}:${r.ticker}  pre%=${r.premarketPct}  price=${r.price}  ` +
        `cap=${r.marketCap}  preVol=${r.premarketVolume}  sector=${r.sector}`,
    );
  }
  if (rows.length === 0) {
    console.log(
      "No rows. In mechanical mode this likely means a field name changed - " +
        "verify TV_COLUMNS/TV_FILTERS against the tradingview-screener field list.",
    );
  }
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
