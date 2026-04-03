# Wireframes (MVP)

## 1) Mobile App

### 1.1 Map + CTA

```text
+--------------------------------------------------+
| Clean Sea                           [Profile]    |
+--------------------------------------------------+
|                                                  |
|                  [ MAP VIEW ]                    |
|   pins: green=resolved, red=new, yellow=review   |
|                                                  |
|                              [Locate Me]         |
+--------------------------------------------------+
| [Filters]                          [New Report]  |
+--------------------------------------------------+
```

### 1.2 New Report (sheet / modal)

```text
+-----------------------------------------+
| New Report                              |
+-----------------------------------------+
| Location: [Use current GPS location]    |
| lat,lng: 42.6951, 23.3250               |
| accuracy: 8m                            |
|                                         |
| Media: [Camera] [Gallery]               |
|  - 2 photos selected                    |
|                                         |
| Description                             |
| [Plastic and mixed trash near river..]  |
| [                                     ] |
|                                         |
|            [Cancel] [Publish]           |
+-----------------------------------------+
```

### 1.3 Publish Confirmation

```text
+-----------------------------------------+
| Report published                        |
+-----------------------------------------+
| ID: #RPT-2026-000152                    |
| Status: new                             |
| [Open on map]                           |
+-----------------------------------------+
```

## 2) Web Portal

### 2.1 Dashboard (Map + List)

```text
+------------------------+----------------------------------------+
| Filters                | Map                                    |
| - status               |                                        |
| - city                 |               [ MAP ]                  |
| - date                 |                                        |
|                        |                                        |
+------------------------+----------------------------------------+
| Reports list                                                    |
| #RPT-152 | new | Sofia | 2 media | 2026-03-18 | [Open]         |
| #RPT-151 | in_review | Burgas | 1 media | ... | [Open]         |
+-----------------------------------------------------------------+
```

### 2.2 Report Detail + Moderation

```text
+-------------------------------------------------------------+
| #RPT-152  Status: [new v]  [Save]                          |
+-------------------------------------------------------------+
| Media carousel   | Description                              |
| [img1] [img2]    | "Plastic and old tires..."              |
|                  | Lat/Lng: 42.6951, 23.3250               |
|                  | Accuracy: 8m                            |
+-------------------------------------------------------------+
| Internal note                                              |
| [Assigned for field verification...]                       |
| [Add note]                                                 |
+-------------------------------------------------------------+
| Status history                                              |
| new -> in_review by moderator @ 2026-03-18 12:10 UTC       |
+-------------------------------------------------------------+
```

## 3) Chat Channel (Telegram/Viber/WhatsApp)

### 3.1 User Flow

```text
User: /new
Bot: Send location (use current location)
User: [shared location]
Bot: Add photo or video
User: [photo]
Bot: Add short description
User: "Large trash pile near river bank"
Bot: Confirm submit? [Yes] [No]
User: Yes
Bot: Done. Report #RPT-152 is published.
```

### 3.2 Chat Backoffice Screen (web)

```text
+-------------------------------------------------------------+
| Chat Inbox                                                  |
+-------------------------------------------------------------+
| Channel | User         | Last msg                   | Open  |
| TG      | @ivan_123    | "Yes"                      | [>]   |
| Viber   | +3598...     | "I sent video"             | [>]   |
+-------------------------------------------------------------+
| Selected thread                                              |
| - linked report: #RPT-152                                   |
| - quick replies: [Need more photos] [Thank you]             |
+-------------------------------------------------------------+
```

## UX Rules

- `Publish` is enabled only when GPS + at least 1 media + description are present.
- In offline mode, report is stored in a local `pending queue` and auto-retried.
- Mobile and chat both receive `reportId` so user can track status later.
