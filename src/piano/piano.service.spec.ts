import { PianoService } from './piano.service';

describe('PianoService module shape', () => {
  it('exports PianoService class', () => {
    expect(typeof PianoService).toBe('function');
  });
});
