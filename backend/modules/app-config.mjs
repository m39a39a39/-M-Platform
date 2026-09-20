const label=(ar,en)=>({ar,en});

export const APP_CONTRACT=Object.freeze({
  apiVersion:1,
  appScheme:'mplatform',
  locales:['ar','en'],
  roles:{
    client:label('عميل','Customer'),
    supplier:label('مورد','Supplier'),
    admin:label('إدارة','Admin')
  },
  statuses:{
    requests:{
      review:label('قيد المراجعة','Under review'),
      sent:label('تم الإرسال للموردين','Sent to suppliers'),
      completed:label('مكتمل','Completed')
    },
    quotes:{
      pending:label('قيد المراجعة','Under review'),
      published:label('منشور','Published')
    },
    publicOffers:{
      pending:label('قيد المراجعة','Under review'),
      published:label('منشور','Published')
    },
    interests:{
      pending:label('مقدم','Submitted'),
      coordinating:label('قيد التنسيق','Coordinating'),
      accepted:label('مقبول','Accepted'),
      completed:label('مكتمل','Completed'),
      cancelled:label('ملغي','Cancelled')
    }
  },
  currencies:['USD','SAR','AED','CNY','EUR'],
  uploads:{
    maxImages:5,
    maxImageBytes:1048576,
    mimeTypes:['image/jpeg','image/png','image/webp']
  },
  auth:{
    nativeHeader:{name:'X-M-Client',values:['native','ios','android']},
    bearer:true,
    refreshEndpoint:'/api/v1/auth/refresh'
  },
  routes:{
    state:'/api/v1/state',
    appConfig:'/api/v1/app-config',
    notifications:'/api/v1/notifications',
    markNotificationsRead:'/api/v1/notifications/read',
    pushRegister:'/api/v1/push/register',
    pushUnregister:'/api/v1/push/unregister',
    upload:'/api/v1/uploads',
    mutations:'/api/v1/mutations',
    cartOrders:'/api/v1/cart-orders'
  }
});

export const deepLinks={
  notifications:()=>`${APP_CONTRACT.appScheme}://notifications`,
  supplierRequest:requestId=>`${APP_CONTRACT.appScheme}://supplier/requests/${encodeURIComponent(requestId)}`,
  customerRequest:(requestId,quoteId)=>`${APP_CONTRACT.appScheme}://customer/requests/${encodeURIComponent(requestId)}${quoteId?`?quote=${encodeURIComponent(quoteId)}`:''}`,
  customerPublicOffers:()=>`${APP_CONTRACT.appScheme}://customer/public-offers`
};

export function publicAppConfig(origin){
  return {
    ...APP_CONTRACT,
    web:{origin},
    push:{prepared:true,providerConfigured:false}
  };
}
