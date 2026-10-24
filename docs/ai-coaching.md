# AI coaching — what data leaves your device

Goalie has an **optional** AI coaching feature that can produce a richer
explanation for the free-text **practice hint**. It is **off by default** and is
**server-side only**: the app never contains an AI provider API key.

## When anything is sent

Nothing is sent from your device unless **all** of the following are true:

1. You acknowledge the in-app disclosure in **Settings → AI coaching**.
2. You turn the feature **on** (the toggle is disabled until you acknowledge).
3. You configure an **endpoint URL** that points at a server you trust (see
   [`../server/README.md`](../server/README.md)).

While the feature is **off** (the default), **no data is sent** — the app does
not even make a network request.

## What is sent (only when enabled and an endpoint is set)

When you finish a practice reflection with the feature enabled, the app sends a
single JSON request to the endpoint you configured, containing exactly:

- the **lesson id** (e.g. `computer-science-beginner-1`),
- the lesson's **practice prompt**,
- the lesson's **suggested answer**,
- your **practice text**, truncated to 2000 characters.

That is the complete list. The request goes **only** to the endpoint URL you
entered — Goalie does not route it anywhere else.

## What is NOT sent

- **No** name or display name.
- **No** progression, completed lessons, or mastery results.
- **No** XP, streak, or badges.
- **No** device identifiers, location, or contacts.
- **No** API keys (there is no AI key on the device, ever).

## What AI can and cannot do

The AI response can replace **only** the practice hint text. It can **never**
change a score, award or change XP, grant a badge, or issue a certificate —
those are computed by deterministic on-device logic the AI path cannot reach. If
the server is unreachable, times out, returns an error, or returns anything other
than a valid `{ "hint": string }` response, the app silently falls back to the
built-in local hint. The app never blocks on the network for this feature.

## The disclosure and acknowledgement requirement

The in-app disclosure in Settings summarizes the points above next to the enable
toggle. You must **acknowledge** it before the feature can be turned on. Your
acknowledgement, the enabled state, and the endpoint URL are stored on the device
so the setting survives reopening the app — and the acknowledgement requirement
holds across launches (the toggle re-locks if you remove the acknowledgement).
