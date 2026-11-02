# Changelog

## 2.3.0
- **New: "Worth a second look" notes.** A newer kind of AI website looks designed at first glance, because it was made by an AI with design rules. Its habits are now reported as notes: a small label above every heading ("OUR SERVICES" over "What we do"), small spaced-out capital labels everywhere, and one word of each headline picked out in colour or italics. They don't cost points, because real designers use them on purpose too, but if your site has all three, it's worth asking whether each one earns its place.
- New AI tell: a hand-drawn browser or Mac window (the red, yellow and green dots) around a mock-up, 4 points.
- New AI tell: an arrow typed onto the end of every link ("Learn more →", "Get started →"), 3 points.
- The "New" pill above a headline no longer suggests turning it into a label.
- Scores for real designed sites are unchanged: all 15 of our designed demos score exactly as before.

## 2.2.0
- **Knows when a page hasn't loaded.** Grey loading placeholders still showing, an error on the page, or almost no text: the score is marked unreliable instead of passing an empty page as "Looks designed".
- New AI tell: the same photo used again and again, like one cake picture on twelve different cakes (8 to 10 points). Carousel and marquee copies don't count.
- New AI tell: the default "elegant" font pair (Playfair Display, Cormorant or Lora with Lato or a system font), 6 points. Fake addresses ("123 Bakery Street", 90210, Anytown) count as placeholder text. A page with three section headings, all centred under a centred headline, counts as all centred.

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
