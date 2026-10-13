import { liveBannerDistance } from '../alert-text';
import { NAME_MARK, splitAroundName, splitNameTag } from '../names';

describe('splitAroundName', () => {
  it('splits a sentence at the name and separates the bot tag', () => {
    expect(splitAroundName(`${NAME_MARK} · 6:45 PM`, 'Arun (bot)')).toEqual({
      pre: '',
      base: 'Arun',
      tag: 'bot',
      post: ' · 6:45 PM',
    });
  });

  it('keeps plain names whole', () => {
    expect(splitAroundName(`${NAME_MARK} · 6:45 PM`, 'Priya')).toMatchObject({ base: 'Priya', tag: null });
  });

  it('headline base name drops the suffix', () => {
    expect(splitNameTag('Karthik (bot)').base).toBe('Karthik');
  });
});

describe('liveBannerDistance', () => {
  it('uses the live phrase over the frozen one', () => {
    expect(liveBannerDistance('stopped', '1.3 km behind', '1.1 km behind')).toBe('1.3 km behind');
  });
  it('prefixes offline riders with ≈ like the row', () => {
    expect(liveBannerDistance('offline', '1.3 km behind', '1.1 km behind')).toBe('≈1.3 km behind');
    expect(liveBannerDistance('offline', 'With you', null)).toBe('With you');
  });
  it('falls back to the frozen text when no live phrase exists', () => {
    expect(liveBannerDistance('offline', null, '1.1 km behind')).toBe('1.1 km behind');
    expect(liveBannerDistance('stopped', null, null)).toBeNull();
  });
});
