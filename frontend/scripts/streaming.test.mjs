import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamingIcon, streamingUrl } from '../src/app/shared/streaming.ts';
test('type and declared icon select the allowed platform presentation', () => {
  assert.equal(
    streamingIcon({ type: 'spotify', label: 'Spotify', icon: 'fa-spotify' }),
    'fa-brands fa-spotify',
  );
  assert.equal(
    streamingIcon({ type: 'deezer', label: 'Deezer', icon: 'fa-deezer' }),
    'fa-brands fa-deezer',
  );
  assert.equal(
    streamingIcon({ type: 'spotify', label: 'Spotify', icon: 'arbitrary css' }),
    'fa-solid fa-music',
  );
});
test('navigation requires a valid URL belonging to the declared platform', () => {
  const id = '0123456789abcdefghijkl';
  assert.equal(
    streamingUrl('spotify', 'https://open.spotify.com/intl-pt/track/' + id + '?si=tracking'),
    'https://open.spotify.com/track/' + id,
  );
  assert.equal(
    streamingUrl('deezer', 'https://www.deezer.com/track/123'),
    'https://www.deezer.com/track/123',
  );
  for (const url of [
    'javascript:alert(1)',
    'https://evil.test/track/' + id,
    'https://user@open.spotify.com/track/' + id,
    'https://open.spotify.com/playlist/' + id,
  ])
    assert.equal(streamingUrl('spotify', url), null);
  assert.equal(streamingUrl('deezer', 'https://open.spotify.com/track/' + id), null);
  assert.equal(streamingUrl('unknown', 'https://open.spotify.com/track/' + id), null);
});

test('YouTube accepts only video destinations and canonicalizes shared links', () => {
  const id = 'Abcde_12-XY',
    url = 'https://www.youtube.com/watch?v=' + id;
  assert.equal(
    streamingIcon({ type: 'youtube', label: 'YouTube', icon: 'fa-youtube' }),
    'fa-brands fa-youtube',
  );
  for (const value of [
    url + '&list=playlist&t=20',
    'https://youtu.be/' + id + '?si=tracking',
    'https://m.youtube.com/shorts/' + id + '/',
    'https://www.youtube.com/live/' + id,
    'https://music.youtube.com/watch?v=' + id,
  ])
    assert.equal(streamingUrl('youtube', value), url);
  for (const value of [
    'https://youtu.be.evil.test/' + id,
    'https://user@youtu.be/' + id,
    'http://youtu.be/' + id,
    'https://www.youtube.com/playlist?list=abc',
    'https://www.youtube.com/watch?v=' + id + '&v=xxxxxxxxxxx',
    'https://www.youtube.com/watch?v=bad',
  ])
    assert.equal(streamingUrl('youtube', value), null);
});
