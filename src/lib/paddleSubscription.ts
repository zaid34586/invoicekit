import { supabase } from "./supabase";
import { paddleEnvironment } from "./paddle";

export type PaddleSubscriptionRecord = {
  id: string;
  user_id: string;
  provider: string;
  provider_environment?: "sandbox" | "production";
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  plan: string;
  billing_cycle: string | null;
  status: string;
  currency: string | null;
  amount: number | null;
  renews_at: string | null;
  ends_at: string | null;
  trial_ends_at: string | null;
  cancelled: boolean;
  updated_at: string;
};

export type BillingEventRecord = {
  id: string;
  provider_event_id: string;
  event_name: string;
  order_id: string | null;
  subscription_id: string | null;
  plan: string | null;
  billing_cycle: string | null;
  amount: number;
  currency: string | null;
  status: string | null;
  receipt_url: string | null;
  created_at: string;
};

export type SubscriptionStatusResponse = {
  subscription: PaddleSubscriptionRecord | null;
  billingEvents: BillingEventRecord[];
  ready?: boolean;
  syncMessage?: string | null;
};

async function invoke<T>(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("paddle-subscriptions", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message || "Paddle subscription request failed.");
  if (!data?.ok) throw new Error(data?.error || "Paddle subscription request failed.");
  return data as T & { ok: true };
}


export type PaddleTransactionSyncResult = {
  subscription: PaddleSubscriptionRecord;
  billingEvents: BillingEventRecord[];
  plan: "pro" | "business";
};

export async function syncPaddleTransaction(transactionId: string, environment: "sandbox" | "production") {
  const response = await invoke<PaddleTransactionSyncResult>("sync_transaction", {
    transaction_id: transactionId,
    environment,
  });
  return response;
}

export async function loadPaddleSubscriptionStatus() {
  const response = await invoke<{ status: SubscriptionStatusResponse }>("status", { environment: paddleEnvironment });
  return response.status;
}

export async function createPaddlePortalSession(mode: "overview" | "cancel" | "payment_method" = "overview") {
  const response = await invoke<{ url: string }>("portal", { mode, environment: paddleEnvironment });
  return response.url;
}

export async function cancelPaddleSubscription(effectiveFrom: "next_billing_period" | "immediately" = "next_billing_period") {
  const response = await invoke<{ subscription: PaddleSubscriptionRecord }>("cancel", { effective_from: effectiveFrom, environment: paddleEnvironment });
  return response.subscription;
}

export async function undoScheduledPaddleCancellation() {
  const response = await invoke<{ subscription: PaddleSubscriptionRecord }>("undo_cancel", { environment: paddleEnvironment });
  return response.subscription;
}
