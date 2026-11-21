// Where the copy is going: each template has the parts that destination needs and its character limits, so what
// the Writer gives back can be pasted straight in. Limits marked soft are the platform's recommended lengths
// (beyond them text gets cut off with "See more"); the others are hard limits.
// Sources checked November 2026: Google Ads help (responsive search and Performance Max text assets), Meta ad copy
// specs, LinkedIn Sponsored Content specs.

export type WriterPart = { key: string; label: string; limit?: number; unit?: 'chars' | 'words'; soft?: boolean; count?: number; hint?: string; body?: boolean };
export type WriterTemplate = { id: string; label: string; group: string; parts: WriterPart[]; note?: string; length?: 'line' | 'short' | 'medium' | 'long' | 'article'; /** Only in the new portal's Writer */ v2?: boolean;
  /** How to write it, for the Writer (added on the server's side of the prompt; can be long) */ guide?: string;
  /** Lost Property's own way of writing it, used instead of `guide` in the studio's in-house project */ houseGuide?: string };

export const TEMPLATE_GROUPS = ['Ads', 'Social', 'Email and messages', 'Web', 'Editorial', 'Print and places', 'Other'] as const;

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
  { id: 'video-script', v2: true, label: 'Video script', group: 'Social', note: 'A short film, scene by scene. Opens in Director.', length: 'short', parts: [
    { key: 'scenes', label: 'Scenes', count: 6, hint: 'Each scene: the shot, then " | ", then any voiceover (VO:) or on-screen words (On screen:), or nothing' }] },
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

  // Editorial
  { id: 'press', label: 'Press release', group: 'Editorial', length: 'article', note: 'An announcement for journalists: the news first, then the story, a quote and the boilerplate.', parts: [
    { key: 'headline', label: 'Headline', hint: '[Brand] [does what] for [whom], [what makes it different]' },
    { key: 'subheading', label: 'Opening paragraph', body: true, hint: 'Starts “Date TBC:”, then the news in a sentence or two' },
    { key: 'body', label: 'The story', body: true, hint: 'The context, who’s behind it, the idea, then the details: one paragraph each' },
    { key: 'launch', label: 'When and where', hint: 'One line: when it opens or launches, and where' },
    { key: 'quote', label: 'Quote', body: true, hint: 'Name, role: “…”' },
    { key: 'about', label: 'About', body: true, hint: 'The boilerplate' },
    { key: 'assets', label: 'Press assets', hint: 'Link to the images' }],
    guide: `A press release announcing news from the brand, in this order:
- Headline: "[Brand] [does what] [for whom / where], [the one thing that makes it different]". One line, no full stop.
- Opening paragraph: begins "Date TBC:" (or the date if given). One or two sentences with the news: who has done what, where, and why it's different.
- The story, one paragraph per line: the context (what it is, what makes it different, who it's for, with concrete facts); who's behind it and any named partners; the idea behind it; then the details, one paragraph each (the place, the product, the experience, the people), specific rather than adjectival.
- When and where: one plain line on dates, place and availability.
- Quote: "[Name], [Role], [Brand]:" then a quote in their speaking voice that gives the feeling or the story behind it, not a list of facts. Mark it "[Draft quote for approval]" unless the brief gives one.
- About [Brand]: two or three sentences of boilerplate from what the brand says about itself.
- Press assets: "Asset link: [link to press assets]" unless given.
Third person throughout, except the quote. The news in the first sentence. Never invent facts, names, dates or numbers: put anything missing in [square brackets].`,
    houseGuide: `Lost Property's press release format, in this order:
- Headline: "Lost Property [creates / designs / launches] [what] for [client], [the one thing that makes it different]". One line, no full stop.
- Opening paragraph: begins "Date TBC:" (or the date if given). One or two sentences: "Independent brand design studio Lost Property has created [the work] for [client] - [what the client is and the experience it offers]."
- The story, one paragraph per line:
  1. Context: what the client or place is, what makes it different, what guests or audiences will feel. Concrete facts (number of pools, a policy, a city) carry it.
  2. Who founded it and any partners (architects, interior studios), named.
  3. The big idea: the world or story Lost Property imagined for the brand, and how it informs every layer.
  4. Then the work, part by part, one paragraph each, only for parts in the brief: wordmark and typography; icons; colour and materials; verbal strategy and naming; sound and scent; wayfinding and storytelling moments; characters; products and objects. Each opens with Lost Property as the subject ("Lost Property designed / crafted / developed…") and is specific: name the materials, notes, creatures, places, never adjectives alone.
- When and where: one plain line, e.g. "[Client] is set to open in [city] in [year]."
- Quote: "Steffan Cummins, Founder, Lost Property:" then a quote in his speaking voice that gives the feeling or story behind the work, not a list of deliverables. Mark it "[Draft quote for approval]" if he hasn't given one.
- About Lost Property Studio: "Lost Property is an independent brand design studio founded by Steffan Cummins. Working globally across hospitality, music, art, and culture, the studio combines strategic thinking and creative design to build brands as immersive worlds — engaging, tactile, and culturally-grounded experiences that extend far beyond traditional identity systems." Use it as written unless the brief changes it.
- Press assets: "Asset link: [link to press assets]" unless a link is given.
Third person throughout, except the quote. UK English. Evocative but factual: sensory, concrete detail does the persuading. Hyphens with spaces for asides, as in the studio's releases. Never invent facts, names, dates or numbers: put anything missing in [square brackets].` },
  { id: 'substack', label: 'Substack article', group: 'Editorial', length: 'article', note: 'A first-person essay for a Substack or journal.', parts: [
    { key: 'title', label: 'Title', limit: 8, unit: 'words', soft: true, hint: 'A short statement or nudge, sentence case' },
    { key: 'subtitle', label: 'Subtitle', limit: 20, unit: 'words', soft: true, hint: 'The argument in one plain sentence' },
    { key: 'article', label: 'Article', body: true, hint: 'Open on a scene or observation; real examples; end on a line that lands it' },
    { key: 'note', label: 'Note at the end', hint: 'Optional: a line about the newsletter' }],
    guide: `A long-form article for the brand's Substack or journal, written in the first person by the brand's founder or a named voice (in the brand's voice):
- Title: short, a statement or a gentle instruction, sentence case.
- Subtitle: one plain sentence that says the argument.
- Opening: start with something concrete, a scene, a detail, or something noticed in the world, rather than a claim.
- Shape: move between a personal experience and the bigger idea, and back. Build the case through two to four real, specific examples. Acknowledge the other side fairly before saying where it falls short. Two or three short subheadings are fine.
- Rhythm: mostly paragraphs of two to five sentences, the odd one-line paragraph for emphasis. Natural, conversational sentences; no hype.
- No invented statistics, quotes or facts about real people or work: use [square brackets] for anything to check.
- Ending: no summary and no sales pitch. Close on a line that lands the idea.
- 800 to 1,100 words.`,
    houseGuide: `An essay for Lost Property's Substack, written by Steffan Cummins (founder and creative director) in the first person, about brand, creativity and culture. In the spirit of his pieces "Be more specific.", "Institution vs. individual" and "Work with soul is winning".
- Title: short, a statement or a gentle instruction, sentence case ("Be more specific.", "Work with soul is winning"). A pair of opposites works too.
- Subtitle: one plain sentence that says the argument, often first person ("Why I think…").
- Opening: start with something concrete, a scene, a few specific details, or something he's noticed in the industry, rather than a claim. Get to the point within three short paragraphs.
- Shape: move between a personal reaction or experience (running a studio, a project, a film or album he loved) and the bigger idea, and back. Build the case through two to four real examples from culture: films, music, ads, studios, brands. Name the specific detail that makes each one work. Acknowledge the other side fairly ("I get that…") before saying where it falls short.
- Two or three short subheadings are fine for longer pieces: conversational, slightly evocative, not clever for the sake of it.
- Rhythm: mostly paragraphs of two to five sentences, with the odd one-line paragraph for emphasis. Natural, conversational sentences. Not a string of clipped fragments, no dramatic set-ups like "I'll say this plainly", no hype.
- Honest about uncertainty ("I think", "it feels like"); no invented statistics, quotes or facts about real people or work: use [square brackets] for anything to check.
- Ending: no summary and no call to action. Close on a hopeful, human line that lands the idea.
- 800 to 1,100 words. UK English. Conversational, wise and straightforward, quietly optimistic.` },

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
