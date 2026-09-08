# Seasonal themes

The active theme is selected by `currentTheme` in `theme-config.js`.

```js
const currentTheme = "autumn";
```

Available themes are `autumn` and `summer`.

Each theme uses the same asset contract:

```text
assets/themes/<season>/
  main-header.*
  detail-header.png
  memo-left.png
  memo-right.png
  memo-tape.png
```

When adding another season:

1. Add its asset folder using the names above.
2. Add one `:root[data-theme="<season>"]` block to `styles/themes.css`.
3. Copy an existing theme block and change only its palette, image URLs, and image positions.
4. Add the season's browser theme color to `theme-config.js`.
5. Change `currentTheme` to the new season.

Keep header compositions consistent so layout CSS does not need seasonal edits:

- Main header: wide landscape image with readable space on the left.
- Detail header: wide image with title-safe space on the left and the subject on the right.
- Memo decorations: transparent PNGs with generous empty space around the object.
- Memo tape: horizontal transparent PNG with a wide aspect ratio.
