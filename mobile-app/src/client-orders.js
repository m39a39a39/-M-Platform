export const isClosedClientOrder = order => ['completed','cancelled'].includes(order.status);

export function clientOrderCounts(orders, needsAction) {
  return {
    all: orders.length,
    active: orders.filter(order => !isClosedClientOrder(order)).length,
    action: orders.filter(order => !isClosedClientOrder(order) && needsAction(order)).length,
    completed: orders.filter(order => order.status === 'completed').length,
    cancelled: orders.filter(order => order.status === 'cancelled').length,
  };
}

function normalizeSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').trim();
}

export function filterClientOrders(orders, {filter='all', query='', needsAction=()=>false, reference=order=>order.id}={}) {
  const terms=normalizeSearch(query).replace(/^#/, '').trim().split(/\s+/).filter(Boolean);
  return orders.filter(order => {
    const matches=filter==='active'?!isClosedClientOrder(order):filter==='action'?!isClosedClientOrder(order)&&!!needsAction(order):['completed','cancelled'].includes(filter)?order.status===filter:true;
    const searchText=normalizeSearch(`${order.title} ${reference(order)} ${order.id}`);
    return matches && terms.every(term => searchText.includes(term));
  });
}
