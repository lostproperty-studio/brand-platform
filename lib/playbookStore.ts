import { DEFAULT_PLAYBOOK, type Playbook } from '@/lib/playbook';

// The playbook is part of the platform itself: it isn't shown or editable in the interface.
// It guides the scan, the review, the drafts for each tier and the rules every kit gives AI.
export async function getPlaybook(): Promise<Playbook> {
  return DEFAULT_PLAYBOOK;
}
