// The APP/store/ metadata schema (strategy §1.1): every app commits one typed
// listing — description, keywords, screenshot manifest, privacy labels — so
// store assets are checked, reviewable factory outputs instead of console-only
// tribal knowledge. Field names and limits follow fastlane's deliverfile/
// supply conventions so a Phase-4 generator can emit fastlane metadata dirs
// from this object mechanically. validateStoreListing runs in each app's unit
// tests: a listing that would bounce at the store bounces in CI first.

export type ScreenshotDevice =
  | 'iphone-6.9' // 1320×2868 — required App Store class
  | 'ipad-13' // 2064×2752 — required when iPad is supported
  | 'android-phone' // 1080×1920 minimum
  | 'android-tablet-7'
  | 'android-tablet-10'
  | 'play-feature-graphic'; // 1024×500 — required by Play

export interface StoreScreenshot {
  device: ScreenshotDevice;
  /** Repo-relative path — the manifest is a promise CI can check later. */
  path: string;
  caption?: string;
}

export interface StoreListing {
  /** Must match capacitorConfig's appId. */
  appId: string;
  /** Store display name — both stores cap at 30. */
  name: string;
  /** App Store subtitle / Play short description seed — 30 to fit both. */
  subtitle: string;
  /** Full description — App Store caps at 4000. */
  description: string;
  /** App Store keyword list; joined by commas it must fit 100 chars. */
  keywords: string[];
  /** Apple category ids (e.g. 'GAMES', 'UTILITIES'); Play maps at console. */
  categories: { primary: string; secondary?: string };
  /** Decision A2: paid up front. 0.99 is the brand. */
  priceUsd: number;
  /** Required at listing time — Phase 3b's placeholder until the brand site. */
  supportUrl: string;
  marketingUrl?: string;
  privacy: {
    /** Non-duo apps are 'data-not-collected' by architecture — the bundle
     * check proves it. A duo app would enumerate its labels instead. */
    label: 'data-not-collected';
    /** Both stores require a privacy policy URL even for zero collection. */
    policyUrl: string;
  };
  screenshots: StoreScreenshot[];
}

const APP_ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/;
const URL_RE = /^https:\/\/\S+$/;

/** Returns human-readable problems; empty means store-ready metadata. */
export function validateStoreListing(listing: StoreListing): string[] {
  const errors: string[] = [];
  if (!APP_ID_RE.test(listing.appId)) errors.push(`appId '${listing.appId}' is not reverse-DNS`);
  if (listing.name.length === 0 || listing.name.length > 30) errors.push('name must be 1–30 chars');
  if (listing.subtitle.length === 0 || listing.subtitle.length > 30) errors.push('subtitle must be 1–30 chars');
  if (listing.description.length < 10 || listing.description.length > 4000) {
    errors.push('description must be 10–4000 chars');
  }
  if (listing.keywords.length === 0) errors.push('keywords must not be empty');
  const joined = listing.keywords.join(',');
  if (joined.length > 100) errors.push(`keywords join to ${joined.length} chars (App Store cap: 100)`);
  if (!(listing.priceUsd > 0)) errors.push('priceUsd must be > 0 — the brand is paid up front (A2)');
  if (!URL_RE.test(listing.supportUrl)) errors.push('supportUrl must be https');
  if (listing.marketingUrl !== undefined && !URL_RE.test(listing.marketingUrl)) {
    errors.push('marketingUrl must be https');
  }
  if (!URL_RE.test(listing.privacy.policyUrl)) errors.push('privacy.policyUrl must be https');
  const devices = new Set(listing.screenshots.map((s) => s.device));
  for (const required of ['iphone-6.9', 'android-phone', 'play-feature-graphic'] as const) {
    if (!devices.has(required)) errors.push(`screenshots missing required device '${required}'`);
  }
  const paths = new Set<string>();
  for (const shot of listing.screenshots) {
    if (paths.has(shot.path)) errors.push(`duplicate screenshot path '${shot.path}'`);
    paths.add(shot.path);
  }
  return errors;
}
