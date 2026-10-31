# Changelog

## 2.1.0
- **Sees modern AI-built sites properly.** Lovable, Bolt and v0 sites built with Tailwind 4 write their colours in a newer format (oklch) that the score couldn't read, so near-black text and the default blue buttons slipped through. Every colour format is read now.
- **Two new AI tells:** not one photograph on the whole site (8 points), and the AI builder's own badge left on, like "Edit with Lovable" (6 points).
- Tailwind's vivid default blue now counts as a default accent, alongside indigo and violet. Numbered cards ("01", "[02]") count as identical cards, including grids of six.
- The check scrolls slowly through the page first, so slow sites, lazy images and sections that fade in as you scroll are all loaded before it judges anything.
- Fewer false alarms: a real numbered list of steps no longer counts as identical cards.

## 2.0.1
- Get it free on Gumroad (noshitesites.gumroad.com/l/unshite), which also sends update emails. The GitHub install command is no longer advertised.

## 2.0.0
- **New name: Unshite My Site.** Run it with `/unshite:my-site`. The report goes to `.unshite/report.md`. The checks and the score are unchanged.
- Get the zip free at noshitesites.com/check.

## 1.0.4
- Now installs straight from GitHub inside Claude Code, no zip needed.
- The report ends with a link to update emails and a short guide to the five AI tells (noshitesites.com/check).

## 1.0.3
- Fewer false alarms: stickers and badges are no longer flagged for crowding the links in a sticky header or sticky bottom bar, which pass over everything as you scroll.

## 1.0.2
- Fewer false alarms: text over a photo is judged with the site's darkening overlay included (even one on a layer just above the photo), and the logo in a sticky header no longer counts as an image covering headings.

## 1.0.1
- Says it's made for sites built with Claude Code or Codex (the tools it's tested with); mentions of other site builders removed.
- README: install by dragging the zip into a Claude chat and saying "Install this plugin for me."

## 1.0.0
- First release. `/unshite:my-site` gives any website an AI slop score out of 100 (15 checks for the generic AI look) and runs the full No Shite Sites broken-details check on desktop and phone. It fixes plain mistakes straight away, asks once before any design or copy change, re-checks, and writes `.unshite/report.md` with the score before and after.
