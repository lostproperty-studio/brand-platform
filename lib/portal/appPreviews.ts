import type { AppKey } from '@/lib/portalVersion';

// What each app will do, for when it's coming soon: a one-line teaser (shown on hover) and the features for the
// preview page, each with a fragment of the interface so people can picture it. Safe for client components.

export type Fragment = 'collection' | 'rating' | 'effects' | 'endboard' | 'cutdown' | 'motion' | 'pieces' | 'cowriter' | 'voicecheck' | 'sizes' | 'templates' | 'onbrand';
export type Feature = { title: string; text: string; ui: Fragment };
export type AppPreview = { teaser: string; headline: string; features: Feature[] };

export const APP_PREVIEWS: Record<AppKey, AppPreview> = {
  photographer: {
    teaser: 'Collections of approved, on-brand images, ready to use',
    headline: 'Every image, on brand, in one place',
    features: [
      { title: 'Collections of approved images', text: 'Gather the images you’re cleared to use into collections, by campaign, place or season, and find the right one in seconds.', ui: 'collection' },
      { title: 'Art direction, built in', text: 'Every image is assessed against your brand’s photography principles and given a rating for how well it fits, with a note on why.', ui: 'rating' },
      { title: 'Effects from the studio', text: 'Add the effects Lost Property made for your brand to images, whether you shot them or we supplied them.', ui: 'effects' }
    ]
  },
  director: {
    teaser: 'Short-form video with your brand’s motion built in',
    headline: 'Short-form video, finished on brand',
    features: [
      { title: 'End boards in a click', text: 'Add the motion assets Lost Property made for you as end boards on short-form edits, timed and sized for each place.', ui: 'endboard' },
      { title: 'Every size from one edit', text: 'Make one video and get the vertical, square and wide cuts, with the logo and type kept where they should be.', ui: 'cutdown' },
      { title: 'Your brand, in motion', text: 'Logo animations, type in motion and transitions from your guidelines, ready to drop in.', ui: 'motion' }
    ]
  },
  writer: {
    teaser: 'On-brand copy for every place it’s going',
    headline: 'Write in your voice, everywhere',
    features: [
      { title: 'A piece for every place', text: 'Instagram, email, a poster or a press release: each piece knows its fields and lengths, so the copy pastes straight in.', ui: 'pieces' },
      { title: 'A co-writer on the page', text: 'It suggests the next line as you write and three other ways to say a phrase, always in your voice. You stay the writer.', ui: 'cowriter' },
      { title: 'A check against the voice', text: 'See what’s working and what to change, line by line, against your tone of voice.', ui: 'voicecheck' }
    ]
  },
  designer: {
    teaser: 'Social graphics and slides, laid out on brand',
    headline: 'Designs in any size, on brand from the start',
    features: [
      { title: 'Every size at once', text: 'Make a design once and get it for stories, posts, banners and slides, laid out properly for each.', ui: 'sizes' },
      { title: 'Templates from your guidelines', text: 'Start from layouts Lost Property built from your brand, with your logo, type and colours already in place.', ui: 'templates' },
      { title: 'Always on brand', text: 'Colours, type and logo stay right, so whatever you make looks like it came from the same place.', ui: 'onbrand' }
    ]
  }
};
