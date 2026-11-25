import { adminClient } from '@/lib/supabase/server';
import { mergePreviews, type AppPreviews } from '@/lib/portal/appPreviews';

// The app previews as the studio has edited them (Admin settings → App previews), over the defaults
export async function getAppPreviews(): Promise<AppPreviews> {
  try {
    const { data } = await adminClient().from('studio_settings').select('value').eq('key', 'app_previews').maybeSingle();
    return mergePreviews(data?.value);
  } catch { return mergePreviews(null); }
}
