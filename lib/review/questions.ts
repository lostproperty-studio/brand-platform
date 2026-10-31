// Plain-language questions for the review. Each item becomes one decision: a question you can answer
// yes or no (or explain), and what will happen either way. Claude writes these when it can; these
// fallbacks cover anything it didn't.

export const SECTIONS = [
  { id: 'assets', title: 'Final assets', blurb: 'Which artwork is final, and should be downloadable.' },
  { id: 'labels', title: 'File names', blurb: 'Every deliverable, named clearly and consistently. Remove, find or add files.' },
  { id: 'language', title: 'Wording and rules', blurb: 'Rules or wording that contradict each other, or could confuse your team or AI.' },
  { id: 'styling', title: 'Styling consistency', blurb: 'Styles that are nearly consistent. Pick the right one so there’s only ever one answer.' },
  { id: 'gaps', title: 'Missing rules', blurb: 'Numbers the guidelines don’t give yet, like clear space, minimum sizes and contrast.' },
  { id: 'housekeeping', title: 'Housekeeping', blurb: 'Placeholder copy, empty frames, trial fonts and file setup.' }
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

export type ReviewQuestion = {
  section?: SectionId;
  question: string;          // short, plain, answerable
  why?: string;              // one line of context: what was found
  yes?: string;              // what happens on yes ("I'll …")
  no?: string;               // what happens on no; empty means "tell me what it should be"
  noNeedsDetail?: boolean;   // a "no" needs an explanation before there's a plan
  priority: 1 | 2 | 3;       // 1 most important; 3 is a quick confirm
};
export type ItemLike = { id: string; kind: string; title: string; found: string; proposal: string; input: string; options: string[]; recommend: string };

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const fileName = (s: string) => s.match(/[a-z0-9-]+\.(svg|png)/)?.[0];

export function fallbackSection(i: ItemLike): SectionId {
  if (i.kind === 'asset') return 'assets';
  if (i.kind === 'issue') return 'housekeeping';
  if (i.kind === 'rule') return 'gaps';
  if (i.kind === 'value') return 'styling';
  if (/trial|placeholder|lorem|empty|styles in the file/i.test(i.title)) return 'housekeeping';
  return 'language';
}

export function fallbackQuestion(i: ItemLike): ReviewQuestion {
  const q = fallbackQuestionInner(i);
  return { ...q, section: q.section || fallbackSection(i) };
}

function fallbackQuestionInner(i: ItemLike): ReviewQuestion {
  switch (i.kind) {
    case 'asset': return {
      question: `Is “${i.title}” master artwork the client should be able to download?`,
      why: i.found, priority: 1,
      yes: `I’ll save it as a downloadable asset${fileName(i.proposal) ? ` called ${fileName(i.proposal)}` : ''}, as SVG and PNG.`,
      no: 'I’ll keep it as a visual in the guidelines only. It won’t go in the downloads.'
    };
    case 'conflict': return { question: i.title.endsWith('?') ? i.title : `${i.title}: which is right?`, why: i.found, priority: 1 };
    case 'question': return { question: i.title.endsWith('?') ? i.title : `${i.title}?`, why: i.found, priority: i.input === 'multi' ? 2 : 1 };
    case 'rule': return {
      question: `Is this the right rule for ${lc(i.title)}?`, why: i.found, priority: 2,
      yes: `I’ll add it to the guidelines exactly as written.`, noNeedsDetail: true
    };
    case 'issue': return {
      question: `${i.title}. Shall I deal with it like this?`, why: i.found, priority: /no colour or text styles/i.test(i.title) ? 3 : 2,
      yes: i.proposal ? `I’ll ${lc(i.proposal.replace(/\.$/, ''))}.` : 'I’ll fix it in the kit.', noNeedsDetail: true
    };
    default: return { question: `Is ${lc(i.title)} right?`, why: i.found, priority: 3, yes: 'I’ll use it as found.', noNeedsDetail: true };
  }
}

/** What happens for a choice or written answer, when Claude hasn't said. */
export function planForAnswer(i: ItemLike, answer: string) {
  if (i.input === 'multi') return `I’ll make templates for: ${answer.split('\n').filter(Boolean).join(', ')}.`;
  if (i.input === 'choice') { const a = answer.replace(/\s*\(used \d+ times?\)/, ''); return /meant to be different/i.test(a) ? 'I’ll keep them as separate values and note in the guidelines where each one is used.' : `I’ll use ${a} everywhere this style appears, in the tokens and the guidelines.`; }
  return `I’ll use your answer: “${answer.slice(0, 160)}${answer.length > 160 ? '…' : ''}”`;
}
