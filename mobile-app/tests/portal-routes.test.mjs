import test from 'node:test';
import assert from 'node:assert/strict';
import {portalRole,portalScreen,portalUrl,portalRedirect,storeReturnUrl} from '../src/portal-routes.js';

test('each authenticated role is directed to its own portal',()=>{
  const paths={client:'/customer.html',supplier:'/supplier.html',admin:'/admin.html'};
  for(const [role,path] of Object.entries(paths)){
    assert.equal(portalRedirect(role,'/'),role==='client'?null:path);
    assert.equal(portalRedirect(role,path),role==='client'?'/':null);
    for(const other of Object.values(paths).filter(p=>p!==path))assert.equal(portalRedirect(role,other,'?screen=account'),path);
  }
});
test('refresh and back URLs retain only screens available to that role',()=>{
  assert.equal(portalScreen('supplier','?screen=orders'),'orders');
  assert.equal(portalScreen('client','?screen=orders'),'home');
  assert.equal(portalScreen('client','?screen=team'),'home');
  assert.equal(portalUrl('supplier','requests'),'/supplier.html?screen=requests');
  assert.equal(portalUrl('client','account'),'/customer.html?screen=account');
  assert.equal(portalUrl('client','team'),'/customer.html');
});
test('legacy links and aliases preserve valid navigation',()=>{
  assert.equal(portalRole('/studio.html'),'admin');
  assert.equal(portalRole('/supplier/'),'supplier');
  assert.equal(portalRole('/customer-impersonation'),null);
  assert.equal(portalRedirect('client','/','?screen=account'),'/customer.html?screen=account');
  assert.equal(portalRedirect('supplier','/supplier','?screen=orders'),'/supplier.html?screen=orders');
});
test('shopping remains available to customers and native app stays in its shell',()=>{
  assert.equal(portalRedirect('client','/','?product=123'),null);
  assert.equal(portalRedirect('supplier','/','?product=123'),'/supplier.html');
  assert.equal(portalRedirect('admin','/','?page=products'),'/admin.html');
  assert.equal(portalRedirect('supplier','/','',true),null);
  assert.equal(portalRedirect(null,'/supplier.html'),null);
});

test('customer legacy home resolves to store and login return routes cannot leave it',()=>{
 assert.equal(portalRedirect('client','/customer.html'),'/' );
 assert.equal(portalRedirect('client','/customer.html','?screen=account'),null);
 for(const value of ['https://evil.test','//evil.test','/admin.html','/?screen=account','/\\evil.test'])assert.equal(storeReturnUrl(value),null);
 assert.equal(storeReturnUrl('/?product=p1'),'/?product=p1');assert.equal(storeReturnUrl('/?category=c1'),'/?category=c1');
});
