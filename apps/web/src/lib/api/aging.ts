import type {
  AgingBucketContract,
  AgingItemContract,
  AgingItemDetailContract,
  AgingListQueryContract,
  AgingReportContract,
  AgingSideContract,
} from "@naai-erp/contracts";

export type AgingSide = AgingSideContract;
export type AgingBucket = AgingBucketContract;
export type AgingItem = AgingItemContract;
export type AgingReport = AgingReportContract;
export type AgingItemDetail = AgingItemDetailContract;
export type AgingQuery = AgingListQueryContract;

function queryString(query: AgingQuery) {
  const params = new URLSearchParams({ asOf: query.asOf });
  if (query.partyId) params.set("partyId", query.partyId);
  if (query.accountCode) params.set("accountCode", query.accountCode);
  if (query.bucket) params.set("bucket", query.bucket);
  if (query.paymentStatus) params.set("paymentStatus", query.paymentStatus);
  if (query.includeSettled) params.set("includeSettled", "true");
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  return params.toString();
}

export const agingApi = Object.freeze({
  report(side: AgingSide, query: AgingQuery) {
    return `reports/${side}-aging?${queryString(query)}`;
  },
  party(side: AgingSide, partyId: string, query: AgingQuery) {
    return `reports/${side}-aging/parties/${encodeURIComponent(partyId)}?${queryString(query)}`;
  },
  item(side: AgingSide, itemId: string, query: AgingQuery) {
    return `reports/${side}-aging/items/${encodeURIComponent(itemId)}?${queryString(query)}`;
  },
});
