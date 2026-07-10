# World Capitals Quiz

A typed-answer quiz for learning the capital city of every country in the world (197 countries), in a single self-contained HTML file — no build step, no dependencies.

**Play it:** open `index.html` in any browser.

## How it works

- A country is shown; you type its capital and press Enter.
- **Forgiving spelling** — accents, hyphens, spaces, and punctuation are ignored, and small typos are accepted (edit distance scaled to the word's length). A near-miss is stamped *Close enough*, counted correct, and shows you the exact spelling.
- **Co-capitals accepted** — e.g. Pretoria / Cape Town / Bloemfontein for South Africa, Sucre / La Paz for Bolivia, Kyiv / Kiev for Ukraine.
- **Built to make things stick** — countries you miss come back more often; three correct answers in a row marks a country as mastered. Progress is saved in your browser (localStorage), so you can pick up where you left off.
- **Region practice** — filter to Africa, Asia, Europe, North/South America, or Oceania.
- Don't know one? *Show answer* reveals it (and queues it for review).
