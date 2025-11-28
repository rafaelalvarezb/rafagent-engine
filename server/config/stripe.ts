// Stripe Configuration for RafAgent SaaS
// This file prepares the integration for future monetization

export interface StripeConfig {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  priceIds: {
    free: string;
    pro: string;
    enterprise: string;
  };
}

export const stripeConfig: StripeConfig = {
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  priceIds: {
    free: process.env.STRIPE_FREE_PRICE_ID || '',
    pro: process.env.STRIPE_PRO_PRICE_ID || '',
    enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
  },
};

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
  FREE: {
    name: 'Free',
    price: 0,
    limits: {
      prospects: 50,
      sequences: 1,
      templates: 4,
      emailsPerMonth: 100,
    },
  },
  PRO: {
    name: 'Pro',
    price: 29,
    limits: {
      prospects: 500,
      sequences: 5,
      templates: 20,
      emailsPerMonth: 1000,
    },
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 99,
    limits: {
      prospects: -1, // unlimited
      sequences: -1, // unlimited
      templates: -1, // unlimited
      emailsPerMonth: -1, // unlimited
    },
  },
} as const;

// Future API endpoints for Stripe integration
export const STRIPE_ENDPOINTS = {
  CREATE_CHECKOUT_SESSION: '/api/stripe/create-checkout-session',
  CREATE_PORTAL_SESSION: '/api/stripe/create-portal-session',
  WEBHOOK: '/api/stripe/webhook',
  GET_SUBSCRIPTION: '/api/stripe/subscription',
  CANCEL_SUBSCRIPTION: '/api/stripe/cancel-subscription',
} as const;
