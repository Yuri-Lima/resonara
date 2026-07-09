import { TtsJob, TtsJobStatus } from './tts-job.entity';

describe('TtsJob entity', () => {
  it('constructs with defaults-friendly fields', () => {
    const j = new TtsJob();
    j.id = 'test-id';
    j.status = TtsJobStatus.QUEUED;
    j.text = 'hello';
    j.engine = 'auto';
    j.format = 'wav';
    j.totalChunks = 0;
    j.completedChunks = 0;
    j.progress = 0;
    j.ssml = false;
    expect(j.status).toBe(TtsJobStatus.QUEUED);
    expect(Object.values(TtsJobStatus)).toContain(TtsJobStatus.SYNTHESIZING);
  });
});
