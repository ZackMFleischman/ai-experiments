// The store listing is a checked artifact: valid per @parlor/native's
// fastlane-compatible schema, and its identity can never drift from the
// capacitor config (GAME-SETUP.md §12.5).
import { validateStoreListing } from '@parlor/native';
import { describe, expect, it } from 'vitest';
import capacitor from '../capacitor.config';
import { LISTING } from '../../../store/listing';

describe('store listing', () => {
  it('is store-ready', () => {
    expect(validateStoreListing(LISTING)).toEqual([]);
  });

  it('identity matches the capacitor config', () => {
    expect(LISTING.appId).toBe(capacitor.appId);
    expect(LISTING.name).toBe(capacitor.appName);
  });

  it('collects nothing — the zero-backend privacy label', () => {
    expect(LISTING.privacy.label).toBe('data-not-collected');
  });
});
