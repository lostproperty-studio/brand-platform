// Where the copy is going: each template has the parts that destination needs and its character limits, so what
// the Writer gives back can be pasted straight in. Limits marked soft are the platform's recommended lengths
// (beyond them text gets cut off with "See more"); the others are hard limits.
// Sources checked November 2026: Google Ads help (responsive search and Performance Max text assets), Meta ad copy
// specs, LinkedIn Sponsored Content specs.

export type WriterPart = { key: string; label: string; limit?: number; unit?: 'chars' | 'words'; soft?: boolean; count?: number; hint?: string; body?: boolean };
export type WriterTemplate = { id: string; label: string; group: string; parts: WriterPart[]; note?: string; length?: 'line' | 'short' | 'medium' | 'long' };

export const TEMPLATE_GROUPS = ['Ads', 'Social', 'Email and messages', 'Web', 'Print and places', 'Other'] as const;

export const WRITER_TEMPLATES: WriterTemplate[] = [
  // Ads
  { id: 'google-search', label: 'Google search ad', group: 'Ads', note: 'Responsive search ad: Google mixes the headlines and descriptions, so each must work on its own.', parts: [
    { key: 'headlines', label: 'Headlines', limit: 30, count: 15, hint: 'Each works alone, in any order' },
    { key: 'descriptions', label: 'Descriptions', limit: 90, count: 4 }] },
  { id: 'google-pmax', label: 'Google Performance Max', group: 'Ads', parts: [
    { key: 'headlines', label: 'Headlines', limit: 30, count: 5, hint: 'At least one under 15 characters' },
    { key: 'long', label: 'Long headlines', limit: 90, count: 5 },
    { key: 'descriptions', label: 'Descriptions', limit: 90, count: 5 },
    { key: 'business', label: 'Business name', limit: 25 }] },
  { id: 'meta-feed', label: 'Meta ad (Facebook, Instagram)', group: 'Ads', note: 'Lengths are Meta’s recommended ones; longer text gets cut off with “See more”.', parts: [
    { key: 'primary', label: 'Primary text', limit: 125, soft: true, body: true },
    { key: 'headline', label: 'Headline', limit: 40, soft: true },
    { key: 'description', label: 'Description', limit: 30, soft: true }] },
  { id: 'meta-reels', label: 'Meta Reels or Stories ad', group: 'Ads', parts: [
    { key: 'primary', label: 'Primary text', limit: 72, soft: true },
    { key: 'headline', label: 'Headline', limit: 40, soft: true },
    { key: 'overlay', label: 'On-screen text', limit: 60, soft: true, hint: 'Short enough to read at a glance' }] },
  { id: 'linkedin-ad', label: 'LinkedIn ad', group: 'Ads', note: 'LinkedIn shows the first 150 characters of the intro and about 70 of the headline before cutting off.', parts: [
    { key: 'intro', label: 'Introductory text', limit: 150, soft: true, body: true },
    { key: 'headline', label: 'Headline', limit: 70, soft: true },
    { key: 'description', label: 'Description', limit: 100, soft: true }] },
  { id: 'display', label: 'Display banner', group: 'Ads', parts: [
    { key: 'headline', label: 'Headline', limit: 30 }, { key: 'line', label: 'Supporting line', limit: 60 }, { key: 'cta', label: 'Button', limit: 20 }] },

  // Social
  { id: 'instagram', label: 'Instagram caption', group: 'Social', note: 'About the first 125 characters show before “more”, so the hook goes first. 2,200 maximum.', parts: [
    { key: 'caption', label: 'Caption', limit: 2200, body: true, hint: 'Hook in the first line' }, { key: 'hashtags', label: 'Hashtags', hint: 'Only if the voice uses them' }] },
  { id: 'instagram-story', label: 'Instagram story', group: 'Social', parts: [
    { key: 'overlay', label: 'On-screen text', limit: 60, soft: true }, { key: 'sticker', label: 'Link sticker text', limit: 30 }] },
  { id: 'linkedin', label: 'LinkedIn post', group: 'Social', note: 'About the first 140 characters show before “see more”. 3,000 maximum.', length: 'medium', parts: [
    { key: 'post', label: 'Post', limit: 3000, body: true, hint: 'Hook in the first two lines' }] },
  { id: 'x', label: 'X post', group: 'Social', parts: [{ key: 'post', label: 'Post', limit: 280 }] },
  { id: 'threads', label: 'Threads post', group: 'Social', parts: [{ key: 'post', label: 'Post', limit: 500 }] },
  { id: 'tiktok', label: 'TikTok caption', group: 'Social', parts: [{ key: 'caption', label: 'Caption', limit: 150, soft: true }, { key: 'overlay', label: 'On-screen text', limit: 60, soft: true }] },
  { id: 'youtube', label: 'YouTube video', group: 'Social', parts: [{ key: 'title', label: 'Title', limit: 70, soft: true, hint: '100 maximum; about 70 show in search' }, { key: 'description', label: 'Description', limit: 5000, body: true, hint: 'The first two lines show above the fold' }] },

  // Email and messages
  { id: 'email', label: 'Email', group: 'Email and messages', length: 'medium', parts: [
    { key: 'subject', label: 'Subject line', limit: 50, soft: true }, { key: 'preview', label: 'Preview text', limit: 90, soft: true },
    { key: 'headline', label: 'Headline' }, { key: 'body', label: 'Body', body: true }, { key: 'cta', label: 'Button', limit: 25 }] },
  { id: 'newsletter', label: 'Newsletter', group: 'Email and messages', length: 'long', parts: [
    { key: 'subject', label: 'Subject line', limit: 50, soft: true }, { key: 'preview', label: 'Preview text', limit: 90, soft: true }, { key: 'intro', label: 'Opening', body: true }, { key: 'cta', label: 'Button', limit: 25 }] },
  { id: 'sms', label: 'Text message', group: 'Email and messages', parts: [{ key: 'message', label: 'Message', limit: 160, hint: 'One SMS' }] },
  { id: 'push', label: 'Push notification', group: 'Email and messages', parts: [{ key: 'title', label: 'Title', limit: 40, soft: true }, { key: 'body', label: 'Body', limit: 110, soft: true }] },

  // Web
  { id: 'hero', label: 'Website hero', group: 'Web', parts: [{ key: 'headline', label: 'Headline' }, { key: 'subheading', label: 'Subheading' }, { key: 'cta', label: 'Button', limit: 25 }] },
  { id: 'web-page', label: 'Web page section', group: 'Web', length: 'medium', parts: [{ key: 'headline', label: 'Headline' }, { key: 'subheading', label: 'Subheading' }, { key: 'body', label: 'Body', body: true }, { key: 'cta', label: 'Call to action', limit: 25 }] },
  { id: 'seo', label: 'Search result (SEO)', group: 'Web', parts: [{ key: 'title', label: 'Page title', limit: 60, soft: true }, { key: 'meta', label: 'Meta description', limit: 155, soft: true }] },
  { id: 'product', label: 'Product description', group: 'Web', length: 'medium', parts: [{ key: 'name', label: 'Product line' }, { key: 'body', label: 'Description', body: true }, { key: 'bullets', label: 'Key points', count: 3 }] },
  { id: 'app-store', label: 'App store listing', group: 'Web', parts: [{ key: 'subtitle', label: 'Subtitle (App Store)', limit: 30 }, { key: 'short', label: 'Short description (Google Play)', limit: 80 }, { key: 'promo', label: 'Promotional text', limit: 170 }] },

  // Print and places
  { id: 'poster', label: 'Poster or billboard', group: 'Print and places', parts: [{ key: 'headline', label: 'Headline', limit: 7, unit: 'words', soft: true, hint: 'Readable in a few seconds' }, { key: 'line', label: 'Supporting line', limit: 12, unit: 'words', soft: true }] },
  { id: 'signage', label: 'Signage and wayfinding', group: 'Print and places', parts: [{ key: 'sign', label: 'Sign', limit: 5, unit: 'words', soft: true }, { key: 'detail', label: 'Detail line', limit: 10, unit: 'words', soft: true }] },
  { id: 'packaging', label: 'Packaging', group: 'Print and places', parts: [{ key: 'front', label: 'Front of pack', limit: 8, unit: 'words', soft: true }, { key: 'back', label: 'Back of pack', body: true }] },
  { id: 'press', label: 'Press release', group: 'Print and places', length: 'long', parts: [{ key: 'headline', label: 'Headline' }, { key: 'subheading', label: 'Standfirst' }, { key: 'body', label: 'Body', body: true }] },

  // Other
  { id: 'tagline', label: 'Tagline or strapline', group: 'Other', parts: [{ key: 'line', label: 'Line', limit: 8, unit: 'words', soft: true }] },
  { id: 'presentation', label: 'Presentation slide', group: 'Other', parts: [{ key: 'title', label: 'Slide title' }, { key: 'points', label: 'Points', count: 3 }] },
  { id: 'custom', label: 'Something else', group: 'Other', parts: [] }
];

/** The parts to pick from for "Something else" */
export const CUSTOM_PARTS: WriterPart[] = [
  { key: 'headline', label: 'Headline' }, { key: 'subheading', label: 'Subheading' }, { key: 'body', label: 'Body', body: true }, { key: 'caption', label: 'Caption' }, { key: 'cta', label: 'Call to action' }
];
export const templateById = (id: string) => WRITER_TEMPLATES.find((t) => t.id === id) || WRITER_TEMPLATES[WRITER_TEMPLATES.length - 1];
export const countOf = (s: string, unit: 'chars' | 'words' = 'chars') => (unit === 'chars' ? [...s].length : s.trim().split(/\s+/).filter(Boolean).length);
