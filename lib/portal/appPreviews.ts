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
    teaser: 'Store, find and use your approved brand images',
    headline: 'All your approved brand images in one place',
    line: 'Store, search, crop and use your brand photography, with feedback from an art director when you need it.',
    features: [
      { title: 'Organise images into collections', text: 'Group your approved images by campaign, location or season.', ui: 'collection' },
      { title: 'Brand fit score for every image', text: 'Each image is scored against your photography guidelines, with notes on why.', ui: 'rating' },
      { title: 'Add preset effects', text: 'Apply your brand’s filters and treatments to any image in one click.', ui: 'effects' },
      { title: 'Request a photo shoot brief', text: 'Get a shot list and moodboard from an art director.', ui: 'request', expert: true },
      { title: 'Request retouching', text: 'Send an image to be retouched and it comes back to your collection.', ui: 'retouch', expert: true },
      { title: 'Search images by description', text: 'Type what you’re looking for, like “people outdoors in the evening”.', ui: 'search' },
      { title: 'See usage rights', text: 'Check where each image can be used and when its licence ends.', ui: 'rights' },
      { title: 'Crop for any format', text: 'Get stories, posts and banners from one image, with the subject kept in frame.', ui: 'crops' },
      { title: 'Monthly image picks', text: 'An art director recommends your best images each month.', ui: 'picks', expert: true },
      { title: 'Approve images with your team', text: 'Comment on and sign off images together.', ui: 'approve' }
    ]
  },
  director: {
    teaser: 'Make short videos with your brand’s animations built in',
    headline: 'Make short videos with your brand built in',
    line: 'Edit social videos with your logo animations, end boards and captions ready to use, and get feedback from a motion director.',
    features: [
      { title: 'Easy access to animated assets', text: 'Your logo animations and end boards, ready to drop into any video.', ui: 'endboard' },
      { title: 'Resize for every platform', text: 'Export vertical, square and landscape versions from one edit.', ui: 'cutdown' },
      { title: 'Animated logo and type', text: 'Add logo reveals, animated text and transitions.', ui: 'motion' },
      { title: 'Automatic captions', text: 'Subtitles in your brand typeface, timed to the speech.', ui: 'captions' },
      { title: 'Request a video from a motion director', text: 'Get help with bigger videos, from script to final edit.', ui: 'request', expert: true },
      { title: 'Feedback on your edits', text: 'A motion director leaves notes at exact moments in your video.', ui: 'timecode', expert: true },
      { title: 'Turn a script into a storyboard', text: 'See your video frame by frame before you film it.', ui: 'storyboard' },
      { title: 'Licensed music library', text: 'Tracks picked for your brand and cleared to use on social.', ui: 'music' },
      { title: 'Professional finishing', text: 'Send your edit for colour grading, sound and final polish.', ui: 'handoff', expert: true },
      { title: 'Approve videos with your team', text: 'Share a cut, collect comments and sign it off.', ui: 'approve' }
    ]
  },
  writer: {
    teaser: 'Write copy in your brand’s tone of voice',
    headline: 'Write copy in your brand’s tone of voice',
    line: 'Templates, an AI co-writer and tone of voice checks keep your copy consistent, with an expert writer when you need one.',
    features: [
      { title: 'Templates for every format', text: 'Instagram, email, posters and more, with the right fields and character counts.', ui: 'pieces' },
      { title: 'AI co-writer', text: 'Suggests the next line and alternative wording as you type.', ui: 'cowriter' },
      { title: 'Custom tone of voice', text: 'Checks your copy against your brand voice to keep it consistent.', ui: 'voicecheck' },
      { title: 'Request an expert writer', text: 'Get a professional writer to write or edit a piece.', ui: 'request', expert: true },
      { title: 'Expert copy review', text: 'Important copy is checked by a senior writer before it goes out.', ui: 'review', expert: true },
      { title: 'Fact checking', text: 'Names, dates and prices are checked against your fact sheet.', ui: 'facts' },
      { title: 'Adapt copy for each channel', text: 'Rewrite one message for Instagram, email and print at once.', ui: 'places' },
      { title: 'Press release template', text: 'Write press releases in the standard format.', ui: 'press' },
      { title: 'Write together in real time', text: 'Edit the same doc with your team and see changes live.', ui: 'together' },
      { title: 'Comments and approvals', text: 'Leave feedback and sign off copy with your team.', ui: 'comments' }
    ]
  },
  designer: {
    teaser: 'Make on-brand social graphics and slides',
    headline: 'Make on-brand graphics in every size',
    line: 'Ready-made brand templates for social and slides, with help from an expert designer when you need it.',
    features: [
      { title: 'Resize to every format', text: 'Create one design and get it for stories, posts, banners and slides.', ui: 'sizes' },
      { title: 'Brand templates', text: 'Layouts built from your guidelines, ready to fill in.', ui: 'templates' },
      { title: 'Brand colours, fonts and logos built in', text: 'Only your approved colours, typefaces and logos are available.', ui: 'onbrand' },
      { title: 'Request a designer', text: 'Brief an expert designer for anything a template can’t do.', ui: 'request', expert: true },
      { title: 'Professional finishing', text: 'Send a design to be polished by a senior designer.', ui: 'handoff', expert: true },
      { title: 'Smart layouts', text: 'Layouts adjust automatically when you change the text or image.', ui: 'layout' },
      { title: 'Design feedback', text: 'A senior designer leaves notes directly on your design.', ui: 'review', expert: true },
      { title: 'Export in any format', text: 'Download PNG, PDF and video, sized for where they’re going.', ui: 'export' },
      { title: 'Comments and approvals', text: 'Collect feedback and sign off designs with your team.', ui: 'comments' },
      { title: 'Version history', text: 'See every version and who approved it.', ui: 'approve' }
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
