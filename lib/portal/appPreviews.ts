import type { AppKey } from '@/lib/portalVersion';

// What each app does, for its About page (and the preview while it's coming soon): a teaser for hover, a headline
// and a line about what the client gets, and the features, each with a small illustration of the interface.
// These are the defaults; the studio edits them in Admin settings → App previews (stored in studio_settings).
// Safe for client components.

export type Fragment =
  | 'collection' | 'rating' | 'effects' | 'search' | 'rights' | 'crops' | 'picks' | 'retouch'
  | 'endboard' | 'cutdown' | 'motion' | 'captions' | 'music' | 'timecode' | 'storyboard'
  | 'pieces' | 'cowriter' | 'voicecheck' | 'facts' | 'together' | 'press' | 'places'
  | 'sizes' | 'templates' | 'onbrand' | 'layout' | 'export'
  | 'request' | 'review' | 'handoff' | 'comments' | 'approve';
/** `expert`: expert direction from Lost Property's people, not only the software. `off`: kept but not shown. */
export type Feature = { title: string; text: string; ui: Fragment; expert?: boolean; off?: boolean };
export type AppPreview = { teaser: string; headline: string; line: string; features: Feature[] };
export type AppPreviews = Record<AppKey, AppPreview>;

/** The illustrations the studio can pick from, by name, grouped for the editor */
export const FRAGMENTS: { id: Fragment; name: string; group: string }[] = [
  { id: 'collection', name: 'Image collection', group: 'Images' }, { id: 'rating', name: 'Art direction score', group: 'Images' },
  { id: 'effects', name: 'Effect, before and after', group: 'Images' }, { id: 'search', name: 'Search', group: 'Images' },
  { id: 'rights', name: 'Usage rights', group: 'Images' }, { id: 'crops', name: 'Crops in three sizes', group: 'Images' },
  { id: 'picks', name: 'Monthly picks', group: 'Images' }, { id: 'retouch', name: 'Retouching progress', group: 'Images' },
  { id: 'endboard', name: 'End board on a phone', group: 'Video' }, { id: 'cutdown', name: 'Video in three sizes', group: 'Video' },
  { id: 'motion', name: 'Logo in motion', group: 'Video' }, { id: 'captions', name: 'Captions', group: 'Video' },
  { id: 'music', name: 'Music list', group: 'Video' }, { id: 'timecode', name: 'Note pinned to a frame', group: 'Video' },
  { id: 'storyboard', name: 'Storyboard', group: 'Video' },
  { id: 'pieces', name: 'Pieces with character counts', group: 'Words' }, { id: 'cowriter', name: 'Co-writer suggestion', group: 'Words' },
  { id: 'voicecheck', name: 'Voice check', group: 'Words' }, { id: 'facts', name: 'Fact check', group: 'Words' },
  { id: 'together', name: 'Writing together', group: 'Words' }, { id: 'press', name: 'Press release', group: 'Words' },
  { id: 'places', name: 'One line, three places', group: 'Words' },
  { id: 'sizes', name: 'Design in three sizes', group: 'Design' }, { id: 'templates', name: 'Templates', group: 'Design' },
  { id: 'onbrand', name: 'Palette, type and logo', group: 'Design' }, { id: 'layout', name: 'Layout that adapts', group: 'Design' },
  { id: 'export', name: 'Exports', group: 'Design' },
  { id: 'request', name: 'Message to an expert', group: 'Expert direction' }, { id: 'review', name: 'Expert review', group: 'Expert direction' },
  { id: 'handoff', name: 'Handed to an expert', group: 'Expert direction' }, { id: 'comments', name: 'Comments', group: 'Expert direction' },
  { id: 'approve', name: 'Sign-off', group: 'Expert direction' }
];

/** Who the expert is in each app's illustrations */
export const EXPERT: Record<AppKey, string> = { photographer: 'Art director', director: 'Motion director', writer: 'Senior writer', designer: 'Senior designer' };

export const APP_PREVIEWS: AppPreviews = {
  photographer: {
    teaser: 'The right image every time, with an art director on hand',
    headline: 'The right image, every time',
    line: 'Approved photography your whole team can use with confidence, and expert art direction whenever you want a second eye.',
    features: [
      { title: 'Approved collections', text: 'Every image you’re cleared to use, by campaign, place or season.', ui: 'collection' },
      { title: 'Art direction, built in', text: 'See how well each image fits your brand, and why.', ui: 'rating' },
      { title: 'Your brand’s effects', text: 'Treatments made for your brand, on any image in a click.', ui: 'effects' },
      { title: 'Brief a shoot', text: 'Turn a few lines into a shot list and moodboard from an art director.', ui: 'request', expert: true },
      { title: 'Retouching on request', text: 'Send an image for expert retouching and get it back in your collection.', ui: 'retouch', expert: true },
      { title: 'Search by feeling', text: 'Find “warm, people, evening” without tagging a thing.', ui: 'search' },
      { title: 'Rights at a glance', text: 'Know where every image can run, and when its licence ends.', ui: 'rights' },
      { title: 'A crop for every place', text: 'Stories, posts and banners, with the subject kept in frame.', ui: 'crops' },
      { title: 'Picks every month', text: 'Your strongest images, chosen by an art director for what’s next.', ui: 'picks', expert: true },
      { title: 'Sign off together', text: 'Choose and approve images with your team in one place.', ui: 'approve' }
    ]
  },
  director: {
    teaser: 'Short-form video that looks finished, with a motion director on hand',
    headline: 'Video that looks finished, in minutes',
    line: 'Your team makes the everyday edits with your brand’s motion built in, and gets expert direction on the films that matter.',
    features: [
      { title: 'End boards in a click', text: 'Finish any edit with your brand’s own end board.', ui: 'endboard' },
      { title: 'Every size from one edit', text: 'Vertical, square and wide, with your logo kept in place.', ui: 'cutdown' },
      { title: 'Your brand in motion', text: 'Logo reveals, type and transitions, ready to drop in.', ui: 'motion' },
      { title: 'Captions in your type', text: 'Subtitles in your typeface, timed to the words.', ui: 'captions' },
      { title: 'Direction on the big ones', text: 'Expert direction on the films that matter, from script to final cut.', ui: 'request', expert: true },
      { title: 'Notes on the frame', text: 'A motion director reviews your edit, with notes pinned to the moment.', ui: 'timecode', expert: true },
      { title: 'Storyboards from a script', text: 'See the film frame by frame before anyone picks up a camera.', ui: 'storyboard' },
      { title: 'Music that suits you', text: 'Tracks chosen for your brand, cleared for where you post.', ui: 'music' },
      { title: 'A finishing touch', text: 'Get the grade, sound and polish of a finished film.', ui: 'handoff', expert: true },
      { title: 'Sign off together', text: 'Share a cut, gather comments and approve it in one place.', ui: 'approve' }
    ]
  },
  writer: {
    teaser: 'Copy that sounds like you, everywhere it goes',
    headline: 'Copy that sounds like you, everywhere',
    line: 'Everyone on your team writes in your voice, with a co-writer on the page and an expert writer when it has to be just right.',
    features: [
      { title: 'A piece for every place', text: 'Each piece knows its fields and lengths, so copy pastes straight in.', ui: 'pieces' },
      { title: 'A co-writer on the page', text: 'The next line as you write, and other ways to say it, in your voice.', ui: 'cowriter' },
      { title: 'Check it against your voice', text: 'What’s working and what to change, line by line.', ui: 'voicecheck' },
      { title: 'An expert writer on call', text: 'Get a professional writer on a piece when it has to land.', ui: 'request', expert: true },
      { title: 'Expert sign-off', text: 'The copy that matters most, reviewed before it goes out.', ui: 'review', expert: true },
      { title: 'The facts, always right', text: 'Names, dates and prices checked as you write.', ui: 'facts' },
      { title: 'One idea, every place', text: 'Fit a line to Instagram, email and a poster at once.', ui: 'places' },
      { title: 'Press releases', text: 'Your news in the format journalists expect.', ui: 'press' },
      { title: 'Write together', text: 'See who’s in the doc, and their edits as they happen.', ui: 'together' },
      { title: 'Comments and approvals', text: 'Pass pieces round the team and sign them off.', ui: 'comments' }
    ]
  },
  designer: {
    teaser: 'Graphics that look designed, in every size',
    headline: 'Graphics that look designed, in every size',
    line: 'Your team makes on-brand graphics from expertly built layouts, with a designer’s eye whenever it needs one.',
    features: [
      { title: 'Every size at once', text: 'Make it once for stories, posts, banners and slides.', ui: 'sizes' },
      { title: 'Layouts made for your brand', text: 'Templates designed from your guidelines, ready to fill.', ui: 'templates' },
      { title: 'Always on brand', text: 'Colours, type and logo stay right, whoever’s designing.', ui: 'onbrand' },
      { title: 'A designer on call', text: 'Brief an expert designer for anything beyond a template.', ui: 'request', expert: true },
      { title: 'The finishing touch', text: 'Hand over a design for the last ten percent of polish.', ui: 'handoff', expert: true },
      { title: 'Layouts that adapt', text: 'Change the words or the image and the layout rebalances.', ui: 'layout' },
      { title: 'Design notes', text: 'An expert’s notes, pinned exactly where they matter.', ui: 'review', expert: true },
      { title: 'Ready to export', text: 'PNG, PDF and video, sized and named for where they’re going.', ui: 'export' },
      { title: 'Comments and approvals', text: 'Gather feedback and sign off with your team.', ui: 'comments' },
      { title: 'Every version in one place', text: 'See each version and who approved it.', ui: 'approve' }
    ]
  }
};

/** Stored edits over the defaults: an app the studio has edited replaces its default wholesale */
export function mergePreviews(stored: unknown): AppPreviews {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<AppPreviews>;
  const out = { ...APP_PREVIEWS };
  for (const k of Object.keys(APP_PREVIEWS) as AppKey[]) {
    const v = s[k];
    if (v && typeof v.headline === 'string' && Array.isArray(v.features)) out[k] = { ...APP_PREVIEWS[k], ...v, features: v.features.filter((f) => f && f.title && FRAGMENTS.some((x) => x.id === f.ui)) };
  }
  return out;
}
