import { TracksService } from './tracks.service';

describe('TracksService module shape', () => {
  it('exports TracksService class', () => {
    expect(typeof TracksService).toBe('function');
  });
});
