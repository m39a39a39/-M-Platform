# Mobile API v1

Native iOS/Android clients use `/api/v1/*`. The web aliases under `/api/*` remain available for the website.

## Headers and session

Native authentication requests send `X-M-Client: native` (or `ios` / `android`). Protected calls send:

`Authorization: Bearer <accessToken>`

Refresh tokens are stored in the operating-system secure storage and refreshed through `POST /api/v1/auth/refresh`.

## Authentication

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/recover`
- `POST /api/v1/auth/reset`

## Application endpoints

- `GET /api/v1/state`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/read`
- `POST /api/v1/mutations`
- `POST /api/v1/cart-orders`
- `POST /api/v1/uploads`
- `GET /api/v1/media/:id`
- `POST /api/v1/payment-receipts`
- `POST /api/v1/profile/currency`

Admin:
- `POST /api/v1/moderation`
- `POST /api/v1/accounts/update`
- `POST /api/v1/bulk-public-offers`
- `POST /api/v1/settings`
- `POST /api/v1/team`
- `POST /api/v1/payment-review`

Push preparation:
- `POST /api/v1/push/register`
- `POST /api/v1/push/unregister`

Push endpoints only manage device registration. APNs/FCM delivery requires a provider sender that processes `push_outbox`; until that is deployed, rely on in-app notifications.

## Deep-link targets currently used

- supplier request
- supplier executable order
- customer request
- customer cart order
- payment workflow
- notifications

The mobile UI must always reload authorized state before acting on a notification target; notification payloads are navigation hints, not authorization.
