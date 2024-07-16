# Supertext

This Node.js application scrapes and processes web links from a given root URL using Puppeteer. It allows users to interactively exclude or preserve links, navigate through link levels, and concatenate the content of processed links into a single file.

## Features

- Scrapes web links from a root URL and processes them interactively.
- Allows exclusion and preservation of specific links.
- Supports navigation through multiple levels of links.
- Saves concatenated content of processed links to a file.
- Saves user selections for later resumption of the process.
- Includes a test suite for verifying core functionalities.

## Usage Note

The expr history below is a sample of successful tree creation.
You can confirm quiet similar pattern from Level 4 to Level 6 and you will notice nothing new digged. Then you can exclude all and type "done"

```
Level 1: 1 31
Level 2: 658-
Level 2: 608-
Level 2: 524-
Level 2: 453-
Level 2: 292-
Level 2: 269-
Level 2: p249-
Level 2: 186-
Level 2: p122
Level 2: 122-
Level 2: 40-
Level 2: p24-
Level 2: 1-
Level 3: 220-
Level 3: 201
Level 3: p187-
Level 3: 55-
Level 3: p53-
Level 3: 1-
Level 4: 271-
Level 4: p270
Level 4: 254-
Level 4: 217
Level 4: p196-
Level 4: 1-
Level 5: 306-
Level 5: p242-
Level 5: 1-
Level 6: 313-
Level 6: 271
Level 6: p247-
Level 6: 1-
Level 7: 313-
Level 7: 271
Level 7: 247-
Level 7: 1-
```


## Requirements

- Node.js (>=14.x)
- Puppeteer
- p-limit

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/shogochiai/supertext.git
   cd web-link-scraper
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

## Usage

1. Run the script:
   ```sh
   node index.js
   ```

2. Enter the root URL when prompted, or load the saved root URL from `root_url.txt`.

3. Follow the on-screen instructions to exclude or preserve links, navigate levels, apply past choices, or finish the process:
   - Enter the numbers of links to exclude (space-separated, use "-" for range).
   - Prefix with "p" to preserve (e.g., "p1").
   - Enter "next" to move to the next level.
   - Enter "apply" to apply past choices (can only be applied once per session).
   - Enter "done" to finish.

4. The concatenated content of processed links will be saved to `result.txt`.

## Running Tests

Run the included test suite to verify core functionalities:
```sh
node index.js test
```

## Files

- `supertext.js`: Main script.
- `root_url.txt`: File to save the root URL.
- `removal_selections.txt`: File to save user selections for link exclusion/preservation.
- `result.txt`: The output.

## License

This project is licensed under the MIT License.

---

Feel free to copy and paste this into your README file.