# Mobile API v1

The existing web API remains compatible. Native iOS/Android clients should use `/api/v1/*`.

## Native client headers

Send `X-M-Client: native` (or `ios` / `android`) on native authentication requests. Do not send a browser `Origin` header.

After login, store the returned access and refresh tokens in the operating system secure keychain/keystore. For protected API calls send:

`Authorization: Bearer <accessToken>`

## Authentication

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/refresh` with `{ "refreshToken": "..." }`
- `POST /api/v1/auth/logout` with the access token in `Authorization`

Native login/register responses include a `tokens` object when a session is immediately available.

## Core endpoints

- `GET /api/v1/health`
- `GET /api/v1/state`
- `GET /api/v1/notifications`
- `POST /api/v1/mutations`
- `POST /api/v1/uploads`
- `GET /api/v1/media/:id`

Administration endpoints keep the same permissions model:

- `POST /api/v1/moderation`
- `POST /api/v1/settings`
- `POST /api/v1/team`

## Compatibility

The original `/api/*` endpoints remain active for the website. API v1 is an alias layer so the mobile app can rely on versioned URLs without requiring a rewrite of the current web client.
