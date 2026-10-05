// One administration-published quote per sourcing request. Older quotes remain in storage.
export function customerQuote(request, quotes = []) {
  const rows = quotes.filter(q => q.requestId === request.id && q.status === 'published' && !q.deletedAt && !q.suspendedAt);
  if (request.selectedQuoteId) return rows.find(q => q.id === request.selectedQuoteId) || null;
  return rows.sort((a,b) => (Date.parse(b.publishedAt || b.updatedAt || b.createdAt) || 0) - (Date.parse(a.publishedAt || a.updatedAt || a.createdAt) || 0) || String(b.id).localeCompare(String(a.id)))[0] || null;
}
export function canRespondToQuote(request, quote) {
  return !!quote && !request.selectedQuoteId && request.rejectedQuoteId !== quote.id && !request.cancelledAt && !['completed','cancelled'].includes(request.status) && !['completed','cancelled'].includes(request.trackingStatus);
}
