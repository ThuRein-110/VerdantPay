import {preferences} from '@mfu/ui/server-locale.ts';

export async function financePreferences() {
 const settings=await preferences('system','en');
 return {...settings,locale:settings.locale==='th'?'th' as const:'en' as const};
}
