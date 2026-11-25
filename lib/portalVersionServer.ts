import { canSee, projectStages } from '@/lib/features';
import { portalV2 } from '@/lib/portalVersion';

// Server side of the new portal's switch: on everywhere on the staging site, otherwise per project by its release stage

/** Whether this person sees the new portal on this project. `preview` = studio staff in the studio preview. */
export async function portalV2For(projectId: string, preview: boolean) {
  if (portalV2()) return true;
  return canSee((await projectStages(projectId)).portal, preview);
}

/** Whether the studio's tools for the new portal (Motion, the apps' files) are open on this project: any stage but Off */
export async function portalV2Studio(projectId: string) {
  if (portalV2()) return true;
  return (await projectStages(projectId)).portal !== 'off';
}
