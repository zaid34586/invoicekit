import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";
import type { BillingCycle, Plan } from "./pricing";

const clientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();

// Paddle client-side tokens are prefixed "test_" for sandbox and "live_" for
// production — these are two completely separate systems on Paddle's side
// (separate products, prices, customers). Previously this was hardcoded to
// "production" always, so a sandbox token (test_...) got initialized against
// Paddle's production environment, which can never work — Paddle.js just
// shows a generic "Something went wrong" with no useful detail. Detecting
// the environment from the token itself means the same code works correctly
// whether VITE_PADDLE_CLIENT_TOKEN is a sandbox or live value, with zero
// extra configuration needed.
const paddleEnvironment: "sandbox" | "production" = clientToken?.startsWith("test_") ? "sandbox" : "production";

const priceIds: Record<Exclude<Plan, "free">, Record<BillingCycle, string | undefined>> = {
  pro: {
    monthly: import.meta.env.VITE_PADDLE_PRO_MONTHLY_PRICE_ID?.trim(),
    yearly: import.meta.env.VITE_PADDLE_PRO_YEARLY_PRICE_ID?.trim(),
  },
  business: {
    monthly: import.meta.env.VITE_PADDLE_BUSINESS_MONTHLY_PRICE_ID?.trim(),
    yearly: import.meta.env.VITE_PADDLE_BUSINESS_YEARLY_PRICE_ID?.trim(),
  },
};

let paddlePromise: Promise<Paddle | undefined> | null = null;

function handlePaddleEvent(event: PaddleEventData) {
  window.dispatchEvent(new CustomEvent("rivox:paddle-event", { detail: event }));
}

export function getPaddleConfigurationStatus() {
  const missing: string[] = [];
  if (!clientToken) missing.push("VITE_PADDLE_CLIENT_TOKEN");
  if (!priceIds.pro.monthly) missing.push("VITE_PADDLE_PRO_MONTHLY_PRICE_ID");
  if (!priceIds.pro.yearly) missing.push("VITE_PADDLE_PRO_YEARLY_PRICE_ID");
  if (!priceIds.business.monthly) missing.push("VITE_PADDLE_BUSINESS_MONTHLY_PRICE_ID");
  if (!priceIds.business.yearly) missing.push("VITE_PADDLE_BUSINESS_YEARLY_PRICE_ID");
  return { configured: missing.length === 0, missing };
}

export async function getPaddle() {
  if (!clientToken) {
    throw new Error("Paddle client token is missing. Add VITE_PADDLE_CLIENT_TOKEN and redeploy.");
  }

  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      environment: paddleEnvironment,
      token: clientToken,
      eventCallback: handlePaddleEvent,
      checkout: {
        settings: {
          displayMode: "overlay",
          theme: "light",
          locale: "en",
          showAddDiscounts: true,
          showAddTaxId: true,
          allowDiscountRemoval: true,
          successUrl: `${window.location.origin}/billing?checkout=success`,
        },
      },
    });
  }

  const paddle = await paddlePromise;
  if (!paddle) throw new Error("Paddle checkout could not be initialized.");
  return paddle;
}

export async function openPaddleCheckout({
  plan,
  cycle,
  userId,
  email,
  discountCode,
  discountId,
  offerId,
}: {
  plan: Exclude<Plan, "free">;
  cycle: BillingCycle;
  userId?: string;
  email?: string;
  discountCode?: string;
  discountId?: string;
  offerId?: string;
}) {
  const priceId = priceIds[plan][cycle];
  if (!priceId) throw new Error(`Paddle ${plan} ${cycle} price ID is missing.`);

  const paddle = await getPaddle();
  const discount = discountId?.trim()
    ? { discountId: discountId.trim() }
    : discountCode?.trim()
      ? { discountCode: discountCode.trim() }
      : {};

  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: email ? { email } : undefined,
    ...discount,
    customData: {
      user_id: userId ?? null,
      plan,
      billing_cycle: cycle,
      source: "rivox_web",
      offer_id: offerId ?? null,
      offer_code: discountCode?.trim() || null,
      paddle_discount_id: discountId?.trim() || null,
    },
    settings: {
      displayMode: "overlay",
      theme: "light",
      locale: "en",
      showAddDiscounts: true,
      showAddTaxId: true,
      successUrl: `${window.location.origin}/billing?checkout=success`,
    },
  });
}
