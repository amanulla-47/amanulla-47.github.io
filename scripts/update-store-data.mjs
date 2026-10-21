#!/usr/bin/env node
/**
 * Automated Store Data Sync Script
 * Fetches live install brackets & exact install counts from Google Play
 * and live app ratings/metadata from the Apple iTunes Lookup API.
 *
 * Uses a high-water mark rule: only upgrades download milestones when a higher bracket is reached,
 * ensuring cumulative multi-store milestones (e.g., 5M+, 1M+) are never downgraded.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const ROOT_DIR = process.cwd();
const CONFIG_PATH = path.join(ROOT_DIR, 'config.js');
const CACHE_PATH = path.join(ROOT_DIR, 'store-cache.json');

const BRACKETS = [
  { min: 100_000_000, label: '100M+' },
  { min: 50_000_000, label: '50M+' },
  { min: 10_000_000, label: '10M+' },
  { min: 5_000_000, label: '5M+' },
  { min: 1_000_000, label: '1M+' },
  { min: 500_000, label: '500K+' },
  { min: 100_000, label: '100K+' },
  { min: 50_000, label: '50K+' },
  { min: 10_000, label: '10K+' },
  { min: 5_000, label: '5K+' },
  { min: 1_000, label: '1K+' },
];

export function parseMilestoneValue(raw) {
  if (!raw || typeof raw !== 'string') return 0;
  const cleaned = raw.trim().toUpperCase().replace(/,/g, '');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([KMB])?\+?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'B') return num * 1_000_000_000;
  if (unit === 'M') return num * 1_000_000;
  if (unit === 'K') return num * 1_000;
  return num;
}

export function formatBracket(value) {
  for (const b of BRACKETS) {
    if (value >= b.min) return b.label;
  }
  return null;
}

function extractGooglePlayId(url) {
  if (!url || !url.includes('play.google.com')) return null;
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('id');
  } catch {
    return null;
  }
}

function extractAppStoreInfo(url) {
  if (!url || !url.includes('apps.apple.com')) return null;
  const match = url.match(/apps\.apple\.com\/(?:([a-z]{2})\/)?app\/(?:[^/]+\/)?id(\d+)/i);
  if (!match) return null;
  return {
    country: (match[1] || 'us').toLowerCase(),
    appId: match[2],
  };
}

async function fetchGooglePlayStats(packageId) {
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en&gl=US`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`Google Play HTTP ${res.status}`);
  const html = await res.text();

  let installsValue = 0;
  let exactInstalls = null;
  let downloadsBracket = null;

  // Pattern 1: Main app install tuple in AF_initDataCallback: ["10,000+",10000,11758,"10K+"]
  const tupleMatch = html.match(/\["(\d{1,3}(?:,\d{3})*\+)",(\d+),(\d+),"(\d+(?:\.\d+)?[KMB]?\+)"\]/i);
  if (tupleMatch) {
    installsValue = Number(tupleMatch[2]);
    exactInstalls = Number(tupleMatch[3]);
    downloadsBracket = tupleMatch[4].toUpperCase();
  } else {
    // Pattern 2: Main app Downloads badge in SSR HTML: >10K+</div><div class="g1rdde">Downloads</div>
    const domMatch = html.match(/>(\d+(?:\.\d+)?[KMB]?\+)<\/div><div[^>]*>Downloads<\/div>/i);
    if (domMatch) {
      downloadsBracket = domMatch[1].toUpperCase();
      installsValue = parseMilestoneValue(downloadsBracket);
    }
  }

  return {
    store: 'google_play',
    packageId,
    installsValue,
    exactInstalls,
    downloadsBracket: downloadsBracket || formatBracket(installsValue),
  };
}

async function fetchAppStoreStats({ appId, country }) {
  const countriesToTry = country && country !== 'us' ? [country, 'us'] : ['us', 'vn', 'gb'];
  for (const c of countriesToTry) {
    const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=${encodeURIComponent(c)}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    if (data.resultCount > 0 && data.results[0]) {
      const app = data.results[0];
      const ratingCount = Number(app.userRatingCount || 0);
      const averageRating = Number(app.averageUserRating || 0);
      // Conservative floor estimate: ~30 installs per public rating on iOS
      const estimatedMinInstalls = ratingCount * 30;
      const bracket = formatBracket(estimatedMinInstalls);
      return {
        store: 'app_store',
        appId,
        country: c,
        ratingCount,
        averageRating: averageRating ? Number(averageRating.toFixed(2)) : null,
        version: app.version || null,
        estimatedMinInstalls,
        downloadsBracket: bracket,
      };
    }
  }
  return null;
}

async function loadPortfolioConfig() {
  const code = await fs.readFile(CONFIG_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { rawCode: code, config: sandbox.window.PORTFOLIO_CONFIG };
}

async function main() {
  const { rawCode, config } = await loadPortfolioConfig();
  if (!config?.games) {
    throw new Error('Could not parse window.PORTFOLIO_CONFIG.games from config.js');
  }

  let updatedCode = rawCode;
  let upgradesCount = 0;
  const cacheData = {
    lastUpdated: new Date().toISOString(),
    games: {},
  };

  for (const [key, game] of Object.entries(config.games)) {
    const links = [game.link, game.playStoreLink, game.appStoreLink].filter(Boolean);
    const currentVal = parseMilestoneValue(game.downloads);
    let bestVal = currentVal;
    let bestBracket = game.downloads;
    const storeReports = [];

    for (const link of links) {
      const gpId = extractGooglePlayId(link);
      const iosInfo = extractAppStoreInfo(link);

      if (gpId) {
        try {
          const stats = await fetchGooglePlayStats(gpId);
          storeReports.push(stats);
          if (stats.installsValue > bestVal && stats.downloadsBracket) {
            bestVal = stats.installsValue;
            bestBracket = stats.downloadsBracket;
          }
          console.log(
            `[Google Play] ${game.title} (${gpId}): ${stats.downloadsBracket || 'N/A'} (${stats.exactInstalls ?? 'N/A'} exact installs)`
          );
        } catch (err) {
          console.warn(`[Google Play] Skipped ${game.title} (${gpId}): ${err.message}`);
        }
      }

      if (iosInfo) {
        try {
          const stats = await fetchAppStoreStats(iosInfo);
          if (stats) {
            storeReports.push(stats);
            if (stats.estimatedMinInstalls > bestVal && stats.downloadsBracket) {
              bestVal = stats.estimatedMinInstalls;
              bestBracket = stats.downloadsBracket;
            }
            console.log(
              `[App Store]   ${game.title} (id${iosInfo.appId}): live (${stats.ratingCount} ratings, ★ ${stats.averageRating ?? 'N/A'}, v${stats.version})`
            );
          } else {
            console.log(`[App Store]   ${game.title} (id${iosInfo.appId}): not returned by lookup`);
          }
        } catch (err) {
          console.warn(`[App Store]   Skipped ${game.title} (id${iosInfo.appId}): ${err.message}`);
        }
      }
    }

    cacheData.games[key] = {
      title: game.title,
      downloads: bestBracket,
      milestoneValue: bestVal,
      premium: bestVal >= 1_000_000 || Boolean(game.premium),
      stores: storeReports,
    };

    if (bestBracket && bestBracket !== game.downloads && bestVal > currentVal) {
      console.log(`  ↑ Upgrading ${game.title} downloads: "${game.downloads}" -> "${bestBracket}"`);
      const blockRegex = new RegExp(`(${key}\\s*:\\s*\\{[\\s\\S]*?downloads\\s*:\\s*)(['"\`])([^'"\`]*)\\2`, 'm');
      if (blockRegex.test(updatedCode)) {
        updatedCode = updatedCode.replace(blockRegex, `$1'${bestBracket}'`);
        upgradesCount++;
      }
      if (bestVal >= 1_000_000 && !game.premium) {
        const premRegex = new RegExp(`(${key}\\s*:\\s*\\{[\\s\\S]*?premium\\s*:\\s*)(false)`, 'm');
        updatedCode = updatedCode.replace(premRegex, `$1true`);
      }
    }
  }

  await fs.writeFile(CACHE_PATH, JSON.stringify(cacheData, null, 2) + '\n', 'utf8');
  console.log(`\nSaved live store cache to store-cache.json`);

  if (upgradesCount > 0) {
    await fs.writeFile(CONFIG_PATH, updatedCode, 'utf8');
    console.log(`Updated config.js with ${upgradesCount} upgraded milestone(s).`);
  } else {
    console.log(`No milestones in config.js needed upgrading (all current milestones are up to date).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
