export const isUnlimitedStock=item=>item?.stockUnlimited!==false;
export const trackedStock=item=>{
  const value=Number(item?.stock);
  return Number.isInteger(value)&&value>=0?value:0;
};
export const stockAllows=(item,quantity)=>{
  const q=Number(quantity);
  return isUnlimitedStock(item)||(Number.isInteger(q)&&q>=0&&q<=trackedStock(item));
};
