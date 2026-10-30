# Instructions for Claude: install Unshite My Site

The user has given you this plugin (as a zip or a folder) and asked you to install it. Follow these steps exactly. Explain each step in one plain sentence as you go; the user may not be technical.

## 1. Put the plugin somewhere permanent
Claude Code reads the plugin from this folder every time, so it must not live in Downloads, a temp folder or a chat attachment area.

- Windows: `%USERPROFILE%\Documents\unshite`
- macOS / Linux: `~/Documents/unshite`

If the user gave you a zip, extract it so that the folder above directly contains `.claude-plugin/`, `skills/` and `README.md` (not a nested `unshite/unshite/`). If that folder already exists from an earlier version, tell the user and follow "Updating" below instead.

## 2. Check it
```
claude plugin validate "<path to the folder>"
```
It should report that validation passed. If it fails, stop and show the user the message.

## 3. Install it
```
claude plugin marketplace add "<path to the folder>"
claude plugin install unshite@unshite
```

## 4. Confirm
```
claude plugin list
```
`unshite@unshite` should appear as installed and enabled.

## 5. Tell the user what's next
Say, in plain words:
1. Restart Claude (close and reopen the app, or start a new session) so the plugin loads.
2. Open a session in your website's project folder.
3. Type `/unshite:my-site`. It scores the site, fixes the mistakes, and asks before changing any design or wording.
4. Point them to `README.md` in the plugin folder for what it checks.

Also check whether Node.js is installed (`node -v`). The checks run in a browser driven by Playwright, which needs Node; if it isn't installed, tell them they'll need the current LTS version from nodejs.org, and offer to help install it.

## Updating
Replace the files in the same folder with the new version (keep the folder path the same), then run:
```
claude plugin marketplace update unshite
claude plugin update unshite@unshite
```
and restart Claude.
