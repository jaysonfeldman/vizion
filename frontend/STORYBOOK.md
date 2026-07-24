# Storybook — Vizion UI

Interactive component gallery for buttons, inputs, soft UI surfaces, metrics, prompt tables, and the sources popup.

## Run locally

From `search-hackathon/frontend`:

```bash
pnpm install
pnpm storybook
```

Opens at [http://localhost:6006](http://localhost:6006).

Start with **Overview → Design System** for the full clickable gallery.

## Static build (download / share)

```bash
pnpm build-storybook
```

Output lands in `storybook-static/`. Zip that folder to share, or serve it:

```bash
npx serve storybook-static
```

## Where to look

| Sidebar | What’s inside |
|--------|----------------|
| **Overview** | Full design-system page — soft CTAs, inputs, card, live MentionsStack popup, metrics + prompt table |
| **Foundation / Soft UI** | Soft buttons, prompt fields, inset/outline cards, status marks |
| **UI /** | Button, Input, Card, Badge (all variants + disabled) |
| **Analytics /** | MentionsStack (open/closed), PromptTable, InsightsBar — clickable |

Everything in Storybook is meant to be clickable: open the sources popup, type in inputs, expand prompt rows.
