import { buildPodcastRss, feedsEnabled } from './podcast-feed';

describe('podcast-feed', () => {
  it('emits required RSS elements', () => {
    const xml = buildPodcastRss({
      title: 'My Book',
      description: 'A test',
      link: 'http://127.0.0.1:3847/',
      imageUrl: 'http://127.0.0.1:3847/cover.png',
      episodes: [
        {
          title: 'Chapter 1',
          enclosureUrl: 'http://127.0.0.1:3847/a.mp3',
          durationSec: 125,
          guid: 'job-ch-0',
          lengthBytes: 1000,
        },
      ],
    });
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('xmlns:itunes=');
    expect(xml).toContain('<enclosure');
    expect(xml).toContain('itunes:duration');
    expect(xml).toContain('job-ch-0');
  });

  it('feedsEnabled respects env', () => {
    const prev = process.env.RESONARA_FEEDS;
    process.env.RESONARA_FEEDS = '0';
    expect(feedsEnabled()).toBe(false);
    process.env.RESONARA_FEEDS = '1';
    expect(feedsEnabled()).toBe(true);
    if (prev === undefined) delete process.env.RESONARA_FEEDS;
    else process.env.RESONARA_FEEDS = prev;
  });
});
