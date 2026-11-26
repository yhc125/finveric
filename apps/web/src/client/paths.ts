import { generatePath } from "react-router";

export const SALE_DETAIL_ROUTE = "/review/:saleId";
export const REVIEW_SIGNALS_PATH = "/review?view=signals";
export const PRODUCT_LIST_PATH = "/products";
export const PRODUCT_DETAIL_ROUTE = "/products/:productId";

export const saleReviewPath = (saleId: string) =>
  generatePath(SALE_DETAIL_ROUTE, { saleId });

export const saleTracePath = (saleId: string, reviewSearch: string) =>
  `/chain?${new URLSearchParams({
    sale: saleId,
    ...(reviewSearch ? { from: reviewSearch } : {}),
  })}`;

export const productDetailPath = (productId: string) =>
  generatePath(PRODUCT_DETAIL_ROUTE, { productId });
