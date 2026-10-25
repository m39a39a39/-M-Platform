import test from 'node:test';
import assert from 'node:assert/strict';
import {portalRole,portalScreen,portalUrl,portalRedirect,portalPaths} from '../src/portal-routes.js';
test('only the administration portal remains',()=>{
 assert.deepEqual({...portalPaths},{admin:'/admin.html'});
 for(const path of ['/admin','/admin.html','/studio.html'])assert.equal(portalRole(path),'admin');
 for(const path of ['/customer','/customer.html','/supplier','/supplier.html','/login.html'])assert.equal(portalRole(path),null);
});
test('administration navigation preserves authorized destinations',()=>{
 assert.equal(portalScreen('admin','?screen=account'),'settings');
 assert.equal(portalScreen('admin','?screen=requests'),'requests');
 assert.equal(portalScreen('admin','?screen=offers'),'overview');
 assert.equal(portalUrl('admin','settings'),'/admin.html?screen=settings');
 assert.equal(portalUrl('client','home'),'/');
 assert.equal(portalUrl('supplier','home'),'/');
 assert.equal(portalRedirect('admin','/'),'/admin.html');
 assert.equal(portalRedirect('admin','/admin.html'),null);
 assert.equal(portalRedirect('client','/'),null);
});
