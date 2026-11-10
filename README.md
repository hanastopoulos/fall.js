# fall.js

Add one script tag and the text on a web page turns the colors of autumn leaves, lets go, and piles up at the bottom of the window.

The page layout never shifts. Each picked character (or word) stays where it is and is hidden in place, so it keeps its space. What falls is a look-alike drawn in a fixed overlay on top of the page.

## Use

```html
<head>
  <script src="fall.js"></script>
</head>
```

Open `demo.html` to see it run. No build step, no dependencies.

## Startup parameters

Pass them as `data-*` attributes, in the script's query string, or from code:

```html
<script src="fall.js" data-unit="word" data-interval="200" data-wind="8"></script>
<script src="fall.js?unit=char&cycle=5000"></script>
<script>Fall.start({ colors: ['#d4a017', '#c8451b'], maxLeaves: 300 });</script>
```

| Option | Default | Meaning |
| --- | --- | --- |
| `unit` | `char` | What one leaf is: `char` or `word` |
| `interval` | `350` | Milliseconds between picking new text |
| `cycle` | `3500` | Milliseconds a piece spends changing color before it drops |
| `delay` | `1000` | Milliseconds to wait after the page is ready |
| `colors` | five leaf colors | Comma-separated list of CSS colors |
| `gravity` | `90` | Pull, in px/s² |
| `terminal` | `120` | Fastest fall speed, in px/s |
| `sway` | `45` | Side-to-side speed, in px/s |
| `wind` | `0` | Constant sideways drift, in px/s; negative blows left |
| `spin` | `40` | Slow tumbling, in deg/s |
| `maxLeaves` | `800` | Stop picking after this many |
| `maxPile` | `0.35` | Tallest the pile may get, as a fraction of window height |
| `root` | `body` | Selector for the part of the page to take text from |
| `exclude` | none | Selector for elements to leave alone |
| `onlyVisible` | `true` | Only pick text currently inside the window |
| `followScroll` | `true` | Scrolling carries the leaves with the page, then they fall again |
| `autostart` | `true` | Start without being asked |
| `respectReducedMotion` | `true` | Do not autostart when the system asks for reduced motion |

## Control

```js
Fall.start(options); // begin, or begin with different options after a reset
Fall.stop();         // stop picking; leaves in the air finish their trip
Fall.reset();        // put the page back exactly as it was
Fall.count;          // leaves so far
```

Add `data-fall-skip` to any element to keep its text.

## Notes

- Wrapping a single character splits its text node, which can break a ligature or a joined script such as Arabic at that spot. `unit: 'word'` avoids it.
- Pages that re-render their own content (React and similar) may put hidden text back.
- Hidden text is also hidden from screen readers until `Fall.reset()` is called.
