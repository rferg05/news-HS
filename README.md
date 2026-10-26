# News

Home Screens module: one news story at a time, made to read from across the room, from The Atlantic, Ground News and other publishers, with a QR code on each story to open it on a phone.

## What it shows

Each story fills the module: the source and how long ago it was published, the headline as large as the box allows, a short summary, the story's photo and a **QR code** in the bottom-right corner. Point a phone camera at the code to open the story. The Atlantic's links open the full article on a phone signed in to your subscription.

**Ground News** stories add a **coverage bar**: the share of outlets covering the story from the Left, Center and Right, as Ground News rates them, and how many outlets cover it. A **Blindspot** (a story one side barely covers) is labeled as one.

Stories change on a timer, crossfading. **Sources take turns**: the first story from each, then the second from each, and so on, so a busy feed can't crowd out a quiet one. A story two feeds share is shown once.

Text grows to fill the module. When a story would only fit with text smaller than 1.5 times the module's Text size, its summary loses sentences, down to the headline alone, so the headline stays large. Fewer summary sentences means larger text.

The photo goes beside the text in a wide module and above it in a tall one (or always beside, above, behind the text, or not at all). A box under 260 px on its short side shows text only. Stories without a usable photo (CBS, ESPN, AP and Reuters send none, or only tiny thumbnails) show as large text.

## Sources

| | |
|---|---|
| **The Atlantic** | Latest, Best of, Politics, Ideas, Global, U.S., Economy, Technology, Science, Health, Culture, Books. Its public feeds: headlines, deks and photos are free. |
| **Ground News** | Top stories, Blindspot, and any topics you list (paste a `ground.news/interest/…` link or type the topic's name). |
| **Other publishers** | New York Times (top, world), Associated Press, Reuters, NPR, BBC News (top, world), The Guardian (US), PBS News, ABC News, CBS News, Ars Technica, The Verge, Wired, ESPN. |

**About Ground News:** it has no public feed or API. The module reads the story data its public web pages carry (the same pages anyone can open without signing in), once every 15 minutes. That's unofficial: if Ground News redesigns its site, the Ground News stories may stop until the module is updated, while every other source keeps working. Your Ground News subscription's personal feed is behind your login, which the module doesn't use; topics stand in for it.

AP and Reuters no longer publish feeds; their stories come from a Google News search limited to the last two days, so they arrive as headlines only.

## Install

In the Home Screens editor, open the Plugin Store, choose **Install from URL**, and paste:

```
https://github.com/rferg05/news-HS/releases/latest/download/news-feed.tar.gz
```

To update: Plugin Store > **Installed**, then the download icon on News, then **Install**.

No account or key is needed.

## Settings

| Setting | Default | |
|---|---|---|
| The Atlantic | Latest | Sections to show. |
| Ground News | Top stories | And/or Blindspot. |
| Ground News topics | none | Comma separated links or names. |
| Other publishers | none | |
| Next story every | 20 s | |
| Story photo | Automatic | Beside the text, above it, behind it, or none. |
| Summary sentences | 2 | 0 shows the headline alone. |
| Ground News coverage bar | on | |
| Hide stories older than | 72 hours | 0 keeps any age. The Atlantic's sections publish a few stories a day. |
| Stories from each source | 10 | |
| Hide stories with these words | none | Comma separated; checks headline and summary. |
| QR code to the story | on | |
| QR code size | Medium | |

## Where it comes from

Each source is fetched through the Home Screens server's plugin proxy (only the hosts listed in `manifest.json` are allowed), checked every 15 minutes, and shared between modules showing the same source. Photos load straight from the publishers' image servers, at a size the module asks for where their CDN resizes by URL (BBC, NPR, Ground News).

## Developing

```bash
npm install
npm run preview   # http://localhost:5181 against the live feeds — try ?photo=background, ?ground=blindspot, ?publishers=bbc,npr, ?w=1800&h=360
npm test
npm run build     # dist/bundle.js
```

`?gallery=12` in the preview shows twelve stories at once at the chosen size; `fitReport()` in the console lists each one's text size and whether anything overflows.

To package: copy `manifest.json` and `dist/bundle.js(.map)` into `release/pkg/news-feed/` and
`tar -czf release/news-feed-<version>.tar.gz -C release/pkg news-feed`, copy it to `release/news-feed.tar.gz`, and attach both to a
GitHub release tagged `v<version>` so the `latest/download` URL keeps working.
