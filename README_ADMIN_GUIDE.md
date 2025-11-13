# Admin guide & data model (short)

## Data models

Category:
- name (string) — display name
- slug (string) — internal
- iconUrl (string) — URL to icon/image
- order (number)

DeviceModel:
- brand
- name (display)
- slug
- category (category slug)
- imageUrl
- priceOverrides: map of repair_code -> price (string or number)

RepairOption:
- code (string) unique internal code
- name (display)
- basePrice (string) default price, can be 'CALL_FOR_PRICE' or number/locale string
- etaDays
- images []
- notes

ServiceRequest:
- contact (object)
- category (slug)
- modelId
- repair_code
- priceAtSubmit
- createdAt

## Pricing precedence
1. Model.priceOverrides[repair_code] — highest
2. RepairOption.basePrice — fallback
3. If missing or invalid -> 'CALL_FOR_PRICE' shown to user and admin alerted.

## Where to edit
Use Admin UI (admin/index.html) or call protected endpoints under /admin/* with header x-admin-password.

## Emails & routing
This starter does not include email sending; integrate a mailer (SendGrid, nodemailer) and configure recipients per category in a meta or settings collection.

