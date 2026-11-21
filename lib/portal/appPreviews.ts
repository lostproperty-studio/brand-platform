import type { AppKey } from '@/lib/portalVersion';

// What each app will do, for when it's coming soon: a teaser (shown on hover), the promise on the preview page,
// and its features, each with a small piece of the interface. Written for client teams who make things every day
// and lean on Lost Property's designers, writers and directors when it matters. Safe for client components.

export type Fragment =
  | 'collection' | 'rating' | 'effects' | 'search' | 'rights' | 'crops' | 'picks' | 'retouch'
  | 'endboard' | 'cutdown' | 'motion' | 'captions' | 'music' | 'timecode' | 'storyboard'
  | 'pieces' | 'cowriter' | 'voicecheck' | 'facts' | 'together' | 'press' | 'places'
  | 'sizes' | 'templates' | 'onbrand' | 'layout' | 'export'
  | 'request' | 'review' | 'handoff' | 'comments' | 'approve';
/** `studio`: something Lost Property's people do with you, not only the software */
export type Feature = { title: string; text: string; ui: Fragment; studio?: boolean };
export type AppPreview = { teaser: string; headline: string; line: string; features: Feature[] };

export const APP_PREVIEWS: Record<AppKey, AppPreview> = {
  photographer: {
    teaser: 'Collections of approved, on-brand images, ready to use',
    headline: 'Every image on brand, with the studio’s eye on it',
    line: 'Your team finds, crops and uses the right images every day. Lost Property’s art directors are a message away when it needs more.',
    features: [
      { title: 'Approved collections', text: 'Every image you’re cleared to use, by campaign, place or season.', ui: 'collection' },
      { title: 'Art direction, built in', text: 'Each image is rated against your photography principles, with a note on why.', ui: 'rating' },
      { title: 'Studio effects', text: 'Apply the treatments Lost Property made for your brand, to any image.', ui: 'effects' },
      { title: 'Brief a shoot', text: 'Send Lost Property a shoot brief and get a shot list and moodboard back.', ui: 'request', studio: true },
      { title: 'Send for retouching', text: 'Pass an image to the studio for retouching and get it back in the collection.', ui: 'retouch', studio: true },
      { title: 'Search by feeling', text: 'Find “warm, people, outdoors, evening” without anyone tagging a thing.', ui: 'search' },
      { title: 'Rights at a glance', text: 'Who shot it, where it can run and when the licence ends.', ui: 'rights' },
      { title: 'A crop for every place', text: 'Stories, posts and banners, with the subject kept in frame.', ui: 'crops' },
      { title: 'Picks from the studio', text: 'Lost Property’s art directors pick the strongest images each month.', ui: 'picks', studio: true },
      { title: 'Signed off together', text: 'Comment, choose and sign off images with your team and ours.', ui: 'approve' }
    ]
  },
  director: {
    teaser: 'Short-form video with your brand’s motion built in',
    headline: 'Short-form video, finished like the studio would',
    line: 'Your team cuts the everyday edits. Lost Property’s motion designers set the craft, and step in for the films that matter.',
    features: [
      { title: 'End boards in a click', text: 'Add the motion assets Lost Property made for you to the end of any edit.', ui: 'endboard' },
      { title: 'Every size from one edit', text: 'Vertical, square and wide, with the logo and type kept in place.', ui: 'cutdown' },
      { title: 'Your brand in motion', text: 'Logo reveals, type in motion and transitions, ready to drop in.', ui: 'motion' },
      { title: 'Captions in your type', text: 'Subtitles set in the brand typeface, timed to the words.', ui: 'captions' },
      { title: 'Brief a film', text: 'Send Lost Property a brief for the bigger pieces and follow it from script to cut.', ui: 'request', studio: true },
      { title: 'Studio review', text: 'A motion designer reviews your edit, with notes pinned to the frame.', ui: 'timecode', studio: true },
      { title: 'Storyboards from a script', text: 'A script from Writer becomes frames you can rearrange before you shoot.', ui: 'storyboard' },
      { title: 'Cleared music', text: 'Tracks chosen for the brand and cleared for the places you post.', ui: 'music' },
      { title: 'Finished by the studio', text: 'Hand an edit to Lost Property for the grade, sound and final polish.', ui: 'handoff', studio: true },
      { title: 'Signed off together', text: 'Share a cut, gather comments and sign it off in one place.', ui: 'approve' }
    ]
  },
  writer: {
    teaser: 'On-brand copy for every place it’s going',
    headline: 'Write in your voice, with the studio’s writers behind you',
    line: 'Your team writes the everyday copy in your voice. Lost Property’s writers check it, sharpen it and take on the big pieces.',
    features: [
      { title: 'A piece for every place', text: 'Each piece knows its fields and lengths, so the copy pastes straight in.', ui: 'pieces' },
      { title: 'A co-writer on the page', text: 'The next line as you write, and other ways to say a phrase, in your voice.', ui: 'cowriter' },
      { title: 'A check against the voice', text: 'What’s working and what to change, line by line.', ui: 'voicecheck' },
      { title: 'Ask a writer', text: 'Send a piece to a Lost Property writer when it has to be just right.', ui: 'request', studio: true },
      { title: 'Studio sign-off', text: 'The studio reviews the copy that matters most before it goes out.', ui: 'review', studio: true },
      { title: 'The facts, always right', text: 'Names, dates and prices from your fact sheet, checked as you write.', ui: 'facts' },
      { title: 'One idea, every place', text: 'Fit a line to Instagram, email and a poster at once.', ui: 'places' },
      { title: 'Press releases', text: 'News in the format journalists expect, in your voice.', ui: 'press' },
      { title: 'Write together', text: 'See who’s in the doc, and their edits as they happen.', ui: 'together' },
      { title: 'Comments and approvals', text: 'Hand pieces round the team and to the studio, and sign them off.', ui: 'comments' }
    ]
  },
  designer: {
    teaser: 'Social graphics and slides, laid out on brand',
    headline: 'Designs on brand from the start, with the studio on hand',
    line: 'Your team makes the everyday graphics from layouts the studio built. Lost Property’s designers finish the ones that need a designer’s hand.',
    features: [
      { title: 'Every size at once', text: 'Make it once for stories, posts, banners and slides.', ui: 'sizes' },
      { title: 'Templates from the studio', text: 'Layouts Lost Property built from your guidelines, ready to fill.', ui: 'templates' },
      { title: 'Always on brand', text: 'Colours, type and logo stay right, whoever’s designing.', ui: 'onbrand' },
      { title: 'Ask a designer', text: 'Brief Lost Property for anything beyond a template, right from the file.', ui: 'request', studio: true },
      { title: 'Studio finishing', text: 'Hand a design to the studio for the last ten percent.', ui: 'handoff', studio: true },
      { title: 'Layouts that adapt', text: 'Change the words or the image and the layout rebalances itself.', ui: 'layout' },
      { title: 'Studio review', text: 'A designer looks over your work, with notes pinned where they matter.', ui: 'review', studio: true },
      { title: 'Ready to export', text: 'PNG, PDF and video, named and sized for where they’re going.', ui: 'export' },
      { title: 'Comments and approvals', text: 'Gather feedback and sign off with your team and ours.', ui: 'comments' },
      { title: 'Signed off together', text: 'One place for every version and who approved it.', ui: 'approve' }
    ]
  }
};
