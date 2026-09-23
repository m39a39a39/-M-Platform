export const SECTION_TYPES=['hero','categories','products','text','banners','welcome','catalog','request','footer','benefits','steps','faq','cta','image','divider','spacer'];
export const SECTION_DEFAULTS={background:'#ffffff',textColor:'#193d43',align:'start',width:'contained',layout:'grid',columns:3,mobileColumns:1,padding:32,gap:20,margin:0,radius:16,titleSize:30,imageHeight:280,imageFit:'cover',imageSide:'end',desktopVisible:true,mobileVisible:true,showTitle:true,showSubtitle:true,showImage:true,showButton:true,buttonTarget:'products',items:''};
export const sectionDefaults=type=>({...SECTION_DEFAULTS,...(type==='footer'?{background:'#17363b',textColor:'#e8eeea'}:type==='welcome'?{background:'#edf2e9'}:{})});
export function normalizeSectionLayout(s={}){const out={};for(const [key,def] of Object.entries(sectionDefaults(s.type))){const value=s[key]??def;if(typeof def==='boolean'){if(typeof value!=='boolean')throw Error('إعداد ظهور القسم غير صالح');out[key]=value;}else out[key]=value;}
 for(const key of ['background','textColor'])if(!/^#[\da-f]{6}$/i.test(out[key]))throw Error('لون القسم غير صالح');
 const choices={align:['start','center','end'],width:['contained','full'],layout:['grid','list','carousel'],imageFit:['cover','contain'],imageSide:['start','end'],buttonTarget:['products','cart','request','register-client']};
 for(const [key,values] of Object.entries(choices))if(!values.includes(out[key]))throw Error('طريقة عرض القسم غير صالحة');
 for(const [key,min,max] of [['columns',1,6],['mobileColumns',1,2],['padding',0,120],['gap',0,64],['margin',0,100],['radius',0,48],['titleSize',16,72],['imageHeight',80,700]]){out[key]=Number(out[key]);if(!Number.isInteger(out[key])||out[key]<min||out[key]>max)throw Error('أبعاد القسم خارج النطاق المسموح');}
 if(typeof out.items!=='string'||out.items.length>12000||out.items.split('\n').length>30)throw Error('محتوى عناصر القسم أطول من المسموح');return out;
}
