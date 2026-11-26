/** 증권사 앱 예시의 경로. 라우터 basename(/channel) 안의 경로다. */
export const channel = {
  catalog: "/",
  fund: "/fund",
  enroll: "/enroll",
  records: "/records",
  verify: "/verify",
};
/** 고객이 증명서로 가입 기록을 확인하는 화면. */
export const verifyPath = (saleId: string) =>
  `${channel.verify}?sale=${encodeURIComponent(saleId)}`;
export const fundPath = (productId: string) =>
  `${channel.fund}?product=${productId}`;
export const enrollPath = (productId: string, version: number) =>
  `${channel.enroll}?${new URLSearchParams({ product: productId, version: String(version) })}`;
/** 내 가입 기록에서 가입 건 하나를 연다. */
export const recordPath = (saleId: string) =>
  `${channel.records}?sale=${encodeURIComponent(saleId)}`;
