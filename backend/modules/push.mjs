import {rpc,assert} from '../lib/supabase.mjs';

export function normalizePushDevice(body={}){
  const deviceId=String(body.deviceId||'').trim();
  const platform=String(body.platform||'').trim().toLowerCase();
  const token=String(body.token||'').trim();
  const appVersion=String(body.appVersion||'').trim();
  const locale=String(body.locale||'').trim().toLowerCase();
  assert(/^[A-Za-z0-9._:-]{8,200}$/.test(deviceId),400,'معرف الجهاز غير صالح / Invalid device ID');
  assert(['ios','android'].includes(platform),400,'نظام الجهاز غير مدعوم / Unsupported platform');
  assert(token.length>=20&&token.length<=4096,400,'رمز الإشعارات غير صالح / Invalid push token');
  assert(appVersion.length<=50&&locale.length<=20,400,'بيانات الجهاز غير صالحة / Invalid device metadata');
  return {deviceId,platform,token,appVersion,locale};
}

export async function registerPushDevice(user,body){
  const d=normalizePushDevice(body);
  await rpc('register_push_device',{actor:user.id,p_device_id:d.deviceId,p_platform:d.platform,p_token:d.token,p_app_version:d.appVersion||null,p_locale:d.locale||null});
  return {ok:true,deviceId:d.deviceId,platform:d.platform};
}

export async function unregisterPushDevice(user,body={}){
  const deviceId=String(body.deviceId||'').trim();
  assert(/^[A-Za-z0-9._:-]{8,200}$/.test(deviceId),400,'معرف الجهاز غير صالح / Invalid device ID');
  await rpc('unregister_push_device',{actor:user.id,p_device_id:deviceId});
  return {ok:true};
}
