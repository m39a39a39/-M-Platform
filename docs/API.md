# API contract

Base: `/api`. JSON writes; browser requests use same-origin cookies. Native apps can supply a verified Supabase access token as `Authorization: Bearer ...`.

All responses containing account data are `private, no-store`. Do not cache auth or personalized API responses in a CDN.

| Method / path | Purpose |
|---|---|
| GET /health | Checks presence of configuration, not database connectivity |
| POST /auth/register | `{email,password,role,name,company,phone,country,category}`; role client or supplier |
| POST /auth/login | `{email,password}`; sets HttpOnly cookies; returns profile |
| POST /auth/logout | Ends browser session |
| GET /state | Role-scoped snapshot; anonymous visitors get approved public offers only |
| POST /uploads | `{source: "data:image/jpeg;base64,..."}`; returns private media URL |
| GET /media/:uuid | Checks ownership or visibility of a linked approved record before returning bytes |
| POST /mutations | `{collection,id,version,patch,redactionConfirmed?}`; permitted fields depend on actor and action |
| POST /moderation | `{kind,id,action,reason}`; kind account/request/quote/public |
| POST /settings | `{version,data}`; settings permission required |
| POST /team | `{id? ,email?,permissions,action}`; action save/block/unblock; account must exist |
| GET /notifications | Latest 50 notifications belonging to the signed-in user |

Collections: `requests`, `quotes`, `publicOffers`, `interests`. Creates use a new unique id and version 0. Updates supply the last returned version. IDs are safe alphanumeric strings with hyphens, max 80 characters. JSON patch is a field map, not RFC 6902. Identity, timestamps and history are server-controlled.

Example request creation:

```json
{
  "collection":"requests",
  "id":"M-a-random-unique-id",
  "version":0,
  "patch":{
    "product":"USB-C cable",
    "specs":"60W, 1 metre, black",
    "quantity":"2000",
    "country":"SA",
    "neededDate":"2026-12-01",
    "images":["/api/media/RETURNED-UUID"]
  }
}
```

Upload images first. Five images per record; each image up to 1 MiB. JPEG/PNG/WebP only. Browser uploads are resized and converted to JPEG before transport. The API checks MIME and file signatures; comprehensive image scanning is not implemented.

Permissions: `requests.read`, `requests.edit`, `offers.read`, `offers.edit`, `translate`, `publish`, `accounts.read`, `moderate`, `trash`, `settings`, `team`. Owner status is SQL-bootstrapped and cannot be assigned by this API.

`GET /state` is a compatibility aggregation endpoint, not the final large-scale list/search API. No claim of load testing or production readiness is made. See architecture and delivery status.
