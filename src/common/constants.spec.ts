import { LUFS_PROFILES, MP3_CBR_BITRATES } from './constants';

describe('constants', () => {
  it('exposes loudness profiles and bitrate ladders', () => {
    expect(LUFS_PROFILES.podcast.targetLufs).toBe(-16);
    expect(MP3_CBR_BITRATES).toContain(192);
  });
});
