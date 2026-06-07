/**
 * Transaction Junction (TJ) API types.
 *
 * Type definitions derived from TJ's documented hosted payment page API.
 * Keep these aligned with their docs; when their docs change, change here.
 *
 * SERVER-ONLY: this module lives under src/server/ and must never be
 * imported by browser code. It contains only types, not secrets, but
 * the convention keeps things tidy.
 */

// =========================================================================
// OAuth
// =========================================================================

export type TJOAuthResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number; // seconds; TJ's token lifetime is 1800 (30 minutes)
};

// =========================================================================
// Transaction statuses — TJ's enum, mapped to our internal order status
// in the webhook receiver / lookup handler.
// =========================================================================

export type TJTransactionStatus =
  | "PAYMENT_INITIATED"
  | "PAYMENT_CANCELLED"
  | "PAYMENT_FAILED"
  | "PAYMENT_AUTHORISED"
  | "PAYMENT_SETTLED"
  | "PAYMENT_REVERSED"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_DECLINED"
  | "PAYMENT_PARTIALLY_REFUNDED"
  | "3DS_INITIATED"
  | "3DS_AUTHORISED"
  | "3DS_FAILED";

// =========================================================================
// Create Session
// =========================================================================

export type TJCreateSessionRequest = {
  redirectSuccessUrl: string;
  redirectFailedUrl: string;
  redirectCancelUrl?: string;
  paymentMethod?: string;
  metaData?: Record<string, string>;
  transaction: {
    amount: number; // float, e.g. 100.01 — NOT cents
    merchantId: string;
    profileId: string;
    merchantRef: string;
    paymentIntentId?: string;
    customerProfileId?: string;
    paymentMethods?: string[];
    mcc?: string;
    terminalId?: string;
    incrementalAuth?: boolean;
    motoFlag?: number;
  };
};

export type TJCreateSessionResponse = {
  ipgwSId: string;       // uuid — internal payment gateway session ID
  redirectUrl: string;   // hosted payment page URL to redirect customer to
  transactionId: string; // uuid — transaction this session is associated with
};

// =========================================================================
// Get Transaction (the authoritative source we always re-check)
// =========================================================================

export type TJCurrency = {
  isoCode: string;
  isoNumber: number;
  fractionalNumber: number;
  symbol: string;
};

export type TJTransaction = {
  transactionId: string;
  paymentIntentId: string;
  paymentType?: string;
  amount: number;
  currency: TJCurrency;
  transactionStatus: TJTransactionStatus;
  merchantRef: string;
  cartItems?: unknown[];
  addresses?: unknown[];
  transactionMoreDetails?: Array<{
    providerResponseCode?: string;
    providerResponseDescription?: string;
    recommendedResponseDescription?: string;
    authCode?: string;
    createdAt?: string;
    lastModified?: string;
  }>;
  subscriptionId?: string;
  createdAt?: string;
  lastModified?: string;
};

// =========================================================================
// Webhook payload — for type hints only; treat the contents as untrusted
// (we re-verify via getTransaction).
// =========================================================================

export type TJWebhookPayload = {
  transactionId: string;
  sessionId?: string;
  paymentIntentId?: string;
  amount?: string;
  responseText?: string;
  paymentType?: string;
  transactionStatus: TJTransactionStatus;
  merchantRef: string;
  tokenInfo?: {
    token: string;
    brand?: string;
    expiryDate?: string;
    maskedPAN?: string;
    NetworkToken?: boolean;
  };
  customerProfileId?: string;
  metadata?: Record<string, string>;
};

// =========================================================================
// Mapping TJ statuses to our internal Order.status
// =========================================================================

export type AppOrderStatus =
  | "pending"
  | "paid"
  | "fulfilled"
  | "refunded"
  | "cancelled";

export function mapTjStatusToOrderStatus(
  tj: TJTransactionStatus,
): AppOrderStatus {
  switch (tj) {
    case "PAYMENT_AUTHORISED":
    case "PAYMENT_SETTLED":
    case "3DS_AUTHORISED":
      return "paid";
    case "PAYMENT_REFUNDED":
    case "PAYMENT_PARTIALLY_REFUNDED":
      return "refunded";
    case "PAYMENT_CANCELLED":
    case "PAYMENT_FAILED":
    case "PAYMENT_DECLINED":
    case "PAYMENT_REVERSED":
    case "3DS_FAILED":
      return "cancelled";
    case "PAYMENT_INITIATED":
    case "3DS_INITIATED":
    default:
      return "pending";
  }
}
