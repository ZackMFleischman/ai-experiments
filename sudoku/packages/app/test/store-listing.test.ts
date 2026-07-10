// The store listing is a factory output, so it gates like one: metadata a
// store would bounce fails here first, and identity can never drift from the
// Capacitor config it ships under.
import { validateStoreListing } from '@parlor/native';
import { describe, expect, it } from 'vitest';
import capacitor from '../capacitor.config';
import { LISTING } from '../../../store/listing';

describe('store listing', () => {
  it('is store-ready', () => {
    expect(validateStoreListing(LISTING)).toEqual([]);
  });

  it('matches the shipped Capacitor identity', () => {
    expect(LISTING.appId).toBe(capacitor.appId);
    expect(LISTING.name).toBe(capacitor.appName);
  });

  it('declares the zero-backend privacy posture (Data Not Collected)', () => {
    expect(LISTING.privacy.label).toBe('data-not-collected');
  });
});
