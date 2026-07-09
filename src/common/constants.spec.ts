import { ALL_QUEUES, LUFS_PROFILES, MP3_CBR_BITRATES } from './constants';

describe('constants', () => {
  it('exposes queues and LUFS profiles', () => {
    expect(ALL_QUEUES.length).toBeGreaterThan(0);
    expect(LUFS_PROFILES.podcast.targetLufs).toBe(-16);
    expect(MP3_CBR_BITRATES).toContain(192);
  });
});
