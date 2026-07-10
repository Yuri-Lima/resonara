/**
 * RSS 2.0 + iTunes podcast feed for a completed TTS job.
 * SECURITY: feeds are unauthenticated by design for LAN podcast apps.
 * Disable with RESONARA_FEEDS=0 (default off in full mode, on in lite).
 */

export interface FeedEpisode {
  title: string;
  description?: string;
  enclosureUrl: string;
  durationSec: number;
  guid: string;
  pubDate?: Date;
  lengthBytes?: number;
}

export interface FeedChannel {
  title: string;
  description: string;
  link: string;
  imageUrl?: string;
  author?: string;
  language?: string;
  episodes: FeedEpisode[];
}

function xmlEscape(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

export function buildPodcastRss(channel: FeedChannel): string {
  const items = channel.episodes
    .map((ep) => {
      const dur = Math.max(0, Math.round(ep.durationSec));
      const hh = String(Math.floor(dur / 3600)).padStart(2, '0');
      const mm = String(Math.floor((dur % 3600) / 60)).padStart(2, '0');
      const ss = String(dur % 60).padStart(2, '0');
      return `    <item>
      <title>${xmlEscape(ep.title)}</title>
      <description>${xmlEscape(ep.description || ep.title)}</description>
      <guid isPermaLink="false">${xmlEscape(ep.guid)}</guid>
      <pubDate>${rfc822(ep.pubDate || new Date())}</pubDate>
      <enclosure url="${xmlEscape(ep.enclosureUrl)}" type="audio/mpeg" length="${ep.lengthBytes || 0}"/>
      <itunes:duration>${hh}:${mm}:${ss}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xmlEscape(channel.title)}</title>
    <description>${xmlEscape(channel.description)}</description>
    <link>${xmlEscape(channel.link)}</link>
    <language>${xmlEscape(channel.language || 'en')}</language>
    <itunes:author>${xmlEscape(channel.author || 'Resonara')}</itunes:author>
    <itunes:summary>${xmlEscape(channel.description)}</itunes:summary>
    ${channel.imageUrl ? `<itunes:image href="${xmlEscape(channel.imageUrl)}"/>\n    <image><url>${xmlEscape(channel.imageUrl)}</url><title>${xmlEscape(channel.title)}</title><link>${xmlEscape(channel.link)}</link></image>` : ''}
${items}
  </channel>
</rss>
`;
}

export function feedsEnabled(): boolean {
  if (process.env.RESONARA_FEEDS === '0') return false;
  if (process.env.RESONARA_FEEDS === '1') return true;
  // default: on in lite, off in full
  return (
    process.env.RESONARA_LITE === '1' || process.env.RESONARA_DESKTOP === '1'
  );
}
