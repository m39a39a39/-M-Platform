# API contract

Base web path: `/api/*`  
Native mobile alias: `/api/v1/*`

The maintained unified interface uses a verified Supabase access token in `Authorization: Bearer ...` on web and native. Native clients also send `X-M-Client: native|ios|android`; the browser build uses the same `/api/v1/*` contract from the current origin. Legacy same-origin cookie support remains server-side for compatibility only.

Personalized responses are `private, no-store`.

## Main endpoints

| Method / path | Purpose |
|---|---|
| GET /health | Basic configuration health check |
| GET /app-config | Public API/app contract metadata |
| POST /auth/register | Register client or supplier |
| POST /auth/login | Login |
| POST /auth/refresh | Native token refresh |
| POST /auth/logout | Logout |
| POST /auth/recover | Request password recovery email |
| POST /auth/reset | Set a new password using a valid recovery token |
| GET /state | Role-scoped snapshot |
| POST /uploads | Upload image data |
| GET /media/:uuid | Authorized media response |
| POST /mutations | Versioned record mutation |
| POST /bulk-public-offers | Bulk product import/update |
| POST /cart-orders | Create a multi-product ready-order cart |
| POST /moderation | Admin moderation |
| POST /accounts/update | Admin account update/block controls |
| POST /profile/currency | Save customer preferred display currency |
| POST /settings | Admin settings, categories, currencies, rates, bank accounts |
| POST /team | Admin team management |
| POST /payment-receipts | Customer payment receipt upload |
| POST /payment-review | Admin receipt review |
| GET /notifications | Latest notifications for current user |
| POST /notifications/read | Mark one/all notifications read |
| POST /push/register | Register a native Push device |
| POST /push/unregister | Disable a native Push device |

Push registration/outbox infrastructure is present, but external APNs/FCM delivery is not considered complete until a native device-registration flow and an outbox sender/provider are deployed.

## Core collections

`requests`, `quotes`, `publicOffers`, `interests`.

Writes use optimistic versions. Updates send the last returned `version`; conflicts return an error instead of silently overwriting newer data.

## Security notes

- Role and permissions are read from the authenticated profile on the server, never trusted from browser input.
- Supplier projections hide customer identity and competing supplier data.
- Customer projections hide supplier identity.
- Payment bank data is only projected to the customer/admin paths that require it.
- Service-role credentials remain server-side.
- Five images per ordinary record; JPEG/PNG/WebP only after validation/compression.
- `GET /state` remains a compatibility snapshot endpoint and should be replaced with paginated server-side queries before very large scale.
