import { createPublicClient, http } from "viem";
import {
  deployment,
  environment,
  type Environment,
} from "../../../scripts/environment.ts";
import { proofKeyHash } from "../../../scripts/artifacts.ts";
import {
  DEMO_CUSTOMER_NO,
  type Deployment,
  type ProductDocument,
  type RuleDocument,
} from "@finveric/core";
import type {
  DiagnoseRequest,
  ApproveRequest,
  OpenSaleRequest,
  SaleAction,
  SaleView,
  SubscribeRequest,
  TamperRequest,
} from "@finveric/core/api";
import {
  createStore,
  FileStore,
  type SaleStore,
} from "./repositories/store.ts";
import { SaleRepository } from "./repositories/sales.ts";
import { CodedError } from "./errors.ts";
import {
  readChainId,
  readCodeHash,
  readCoolingPeriod,
  readLedgerVersion,
  readSale,
} from "./gateways/ledger.ts";
import * as customers from "./modules/customers.ts";
import * as demo from "./modules/demo.ts";
import * as enrollment from "./modules/enrollment.ts";
import * as monitoring from "./modules/health.ts";
import * as products from "./modules/products.ts";
import * as keys from "./modules/keys.ts";
import * as records from "./modules/records.ts";
import * as review from "./modules/review.ts";
import * as rules from "./modules/rules.ts";
import * as settlement from "./modules/settlement.ts";
import * as transactions from "./modules/transactions.ts";

/**
 * API의 실행 맥락: 배포 설정, 역할 키, RPC 클라이언트, 판매 기록 리포지토리.
 * 계층: routes(경로) → modules(업무 절차) → repositories(기록) · gateways(원장·증명).
 * 아래 업무 메서드는 경로·테스트·스크립트가 부르는 입구다. 실제 절차는 modules/에 있다.
 */
export class FundService {
  readonly env: Environment;
  readonly dep: Deployment;
  readonly client;
  readonly repository: SaleRepository;

  constructor(
    options: {
      env?: Environment;
      dep?: Deployment;
      file?: string;
      store?: SaleStore;
    } = {},
  ) {
    this.env = options.env ?? environment();
    this.dep = options.dep ?? deployment(this.env.network);
    this.client = createPublicClient({
      chain: this.env.chain,
      transport: http(this.env.rpcUrl),
    });
    this.repository = new SaleRepository(
      options.store ??
        (options.file
          ? new FileStore(options.file)
          : createStore(
              this.dep,
              `.local/sales-${this.dep.chainId}-${this.dep.ledger.toLowerCase()}.json`,
            )),
    );
  }

  // ── 기록과 잠금 (리포지토리로 넘긴다) ───────────────────────

  get file() {
    return this.repository.file;
  }
  get sales() {
    return this.repository.all();
  }
  find(id: string, customerNo?: string) {
    const record = this.repository.find(id);
    if (
      customerNo &&
      record.customerRef !== customers.customerRef(this, customerNo)
    )
      throw new CodedError("SALE_NOT_FOUND");
    return record;
  }
  save() {
    this.repository.save();
  }
  /** 기록을 바꾸는 요청. 한 번에 하나만 실행한다. */
  exclusive<T>(operation: () => Promise<T>) {
    return this.repository.transaction(operation);
  }
  /** 조회 요청. 공유 저장소에서는 최신 기록을 먼저 읽는다. */
  view<T>(operation: () => Promise<T>) {
    return this.repository.read(operation);
  }

  // ── 시작 검사 ───────────────────────────────────────────────

  async initialize() {
    if (this.dep.ledgerVersion !== 5)
      throw new Error("판매 기록 원장 v5를 배포한 뒤 서버를 다시 시작하세요.");
    if (this.dep.proofKeyHash !== proofKeyHash())
      throw new Error(
        "증명 키와 배포한 Verifier가 다릅니다. 같은 키로 원장을 다시 배포하세요.",
      );
    if ((await readChainId(this)) !== this.dep.chainId)
      throw new Error(
        "RPC 네트워크가 배포 설정과 다릅니다. RPC 주소와 배포 설정을 확인하세요.",
      );
    if ((await readCodeHash(this, this.dep.ledger)) !== this.dep.ledgerCodeHash)
      throw new Error(
        "원장이 없거나 배포 설정과 코드가 다릅니다. 원장을 다시 배포하세요.",
      );
    const [version, cooling] = await Promise.all([
      readLedgerVersion(this),
      readCoolingPeriod(this),
    ]);
    if (version !== 5n || Number(cooling) !== this.dep.coolingPeriod)
      throw new Error(
        "원장 버전이나 숙려 시간이 배포 설정과 다릅니다. 원장을 다시 배포하세요.",
      );
    // 잠금 안에서 복구한다. 그래야 다른 인스턴스가 처리 중인 기록을 중단된 기록으로 보지 않는다.
    await this.exclusive(() => this.reconcile(true));
  }

  // ── 업무 메서드 (modules/로 넘긴다) ─────────────────────────

  /** RPC, 원장, 판매 기록 저장소 점검. */
  health() {
    return monitoring.health(this);
  }
  reconcile(recoverInterrupted = false) {
    return transactions.reconcile(this, recoverInterrupted);
  }
  /** 시연 고객 번호와 가명 ID. */
  demoCustomer(number = DEMO_CUSTOMER_NO) {
    return { number, ref: customers.customerRef(this, number) };
  }
  chainSale(id: string) {
    return readSale(this, id);
  }

  // 기준과 상품
  rules() {
    return rules.listRules(this);
  }
  registerRule(document: RuleDocument) {
    return rules.registerRule(this, document);
  }
  products() {
    return products.listProducts(this);
  }
  registerProduct(document: ProductDocument, expectedVersion?: number) {
    return products.registerProduct(this, document, expectedVersion);
  }
  register() {
    return products.registerDemo(this);
  }

  // 고객과 진단
  customer(customerNo: string) {
    return customers.customer(this, customerNo);
  }
  diagnose(customerNo: string, request: DiagnoseRequest) {
    return customers.diagnose(this, customerNo, request);
  }
  tamper(request: TamperRequest) {
    return demo.tamper(this, request);
  }

  // 판매 건
  open(request: OpenSaleRequest) {
    return enrollment.open(this, request);
  }
  async subscribe(
    id: string,
    request: SubscribeRequest,
    customerNo?: string,
  ): Promise<SaleView> {
    const record = this.find(id, customerNo);
    await enrollment.subscribe(this, record, request);
    return this.publicSale(record);
  }
  async action(
    id: string,
    action: SaleAction,
    customerNo?: string,
    approvalRequest: ApproveRequest = {},
  ): Promise<SaleView> {
    const record = this.find(id, customerNo);
    switch (action) {
      case "approve":
        await review.approve(this, record, approvalRequest);
        break;
      case "abandon":
        await enrollment.abandon(this, record);
        break;
      case "confirm":
        await enrollment.confirm(this, record);
        break;
      case "withdraw":
        await enrollment.withdraw(this, record);
        break;
      case "settle":
        await settlement.settle(this, record);
        break;
      default:
        // 경로는 SALE_ACTIONS마다 하나씩 있다. 없는 동작은 경로 없음(404)으로 끝난다.
        throw new Error(
          `지원하지 않는 판매 건 동작입니다: ${action satisfies never}`,
        );
    }
    return this.publicSale(record);
  }
  publicSale(record: ReturnType<FundService["find"]>) {
    return records.publicSale(this, record);
  }
  publicSales(customerNo?: string) {
    const customerRef = customerNo && customers.customerRef(this, customerNo);
    const sales = customerRef
      ? this.sales.filter((sale) => sale.customerRef === customerRef)
      : this.sales;
    return Promise.all(sales.map((sale) => this.publicSale(sale)));
  }
  publicTraces() {
    return records.publicTraces(this);
  }
  original(id: string, customerNo?: string) {
    return records.original(this, id, customerNo);
  }
  receipt(id: string, customerNo?: string) {
    return records.receipt(this, id, customerNo);
  }

  // API 키(판매사 콘솔에서 발급, 증권사 앱 서버가 사용)
  apiKeys() {
    return keys.listApiKeys(this);
  }
  issueApiKey(name: string) {
    return keys.issueApiKey(this, name);
  }
  revokeApiKey(id: string) {
    return keys.revokeApiKey(this, id);
  }
  /**
   * 키 원문을 확인한다. 사용 중인 키면 ID와 마지막 사용 기록이 필요한지 돌려준다.
   * 공유 저장소에서는 다른 인스턴스가 발급·폐기한 결과를 먼저 읽는다.
   */
  async authenticateApiKey(key: string) {
    const found = await this.view(async () => keys.findApiKey(this, key));
    if (!found) return undefined;
    if (keys.needsTouch(found))
      await this.exclusive(async () => keys.touchApiKey(this, found.id));
    return { id: found.id };
  }
  /** 요청 한도를 키별로 세려고 메모리의 키만 찾는다. 저장소는 읽지 않는다. */
  knownApiKeyId(key: string) {
    return keys.findApiKey(this, key)?.id;
  }
}
