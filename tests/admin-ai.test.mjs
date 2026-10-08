import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdminAiContext,buildProductDraftReference} from '../backend/modules/admin-ai.mjs';

test('MG AI admin context is read-only, aggregated and excludes customer PII',()=>{
  const state={
    publicOffers:[
      {id:'p1',sku:'MG-20W',status:'published',unitPrice:25,currency:'SAR',moq:10,stock:8,stockUnlimited:false,categoryId:'chargers',translation:{titleAr:'شاحن 20 واط'}},
      {id:'p2',sku:'MG-CABLE',status:'review',unitPrice:10,currency:'SAR',moq:20,stock:100,translation:{titleAr:'كيبل'}}
    ],
    accounts:[
      {id:'c1',role:'client',name:'Secret Customer',email:'secret@example.test',phone:'+966500000000',country:'Saudi Arabia'},
      {id:'s1',role:'supplier',name:'Supplier'}
    ],
    interests:[{id:'i1',offerId:'p1'}],
    requests:[{id:'o1',orderType:'cart',orderFlowVersion:2,status:'completed',orderStage:8,currency:'SAR',cartItems:[{interestId:'i1',quantity:20,unitPrice:25,total:500}]}],
    settings:{storefront:{sections:[{id:'hero',type:'hero',title:'الرئيسية',visible:true},{id:'products',type:'products',title:'المنتجات',visible:true,productIds:['p1']}]}}
  };
  const context=buildAdminAiContext(state);
  assert.equal(context.capabilities.readOnly,true);
  assert.equal(context.capabilities.canModifyStore,false);
  assert.equal(context.capabilities.behavioralEventsAvailable,false);
  assert.equal(context.overview.products.published,1);
  assert.equal(context.overview.products.drafts,1);
  assert.equal(context.overview.products.lowStock,1);
  assert.equal(context.overview.customers.total,1);
  assert.equal(context.overview.orders.total,1);
  assert.equal(context.topPurchasedProducts[0].productId,'p1');
  assert.equal(context.topPurchasedProducts[0].quantity,20);
  const serialized=JSON.stringify(context);
  for(const secret of ['Secret Customer','secret@example.test','+966500000000'])assert.equal(serialized.includes(secret),false);
});


test('MG AI product draft reference exposes only active taxonomy and valid parent links',()=>{
  const reference=buildProductDraftReference({settings:{
    categories:[
      {id:'cases',nameAr:'كفرات',nameEn:'Cases',active:true},
      {id:'hidden',nameAr:'مخفي',nameEn:'Hidden',active:false}
    ],
    subcategories:[
      {id:'iphone',parentId:'cases',nameAr:'آيفون',nameEn:'iPhone',active:true},
      {id:'bad-parent',parentId:'hidden',nameAr:'قديم',nameEn:'Old',active:true}
    ],
    supplyCountries:[
      {id:'China',nameAr:'الصين',nameEn:'China',active:true},
      {id:'Disabled',nameAr:'متوقف',nameEn:'Disabled',active:false}
    ]
  }});
  assert.deepEqual(reference.categories.map(x=>x.id),['cases']);
  assert.deepEqual(reference.subcategories.map(x=>x.id),['iphone']);
  assert.deepEqual(reference.supplyCountries.map(x=>x.id),['China']);
});
