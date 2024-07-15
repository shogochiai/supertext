### Supertext

#### Purpose
The script creates a tree structure of web links, allowing users to selectively explore and exclude links from a given starting URL. It includes functionality to resume processing from a saved state.

#### Main Components
1. **Link Fetching and Parsing**: Uses `axios` to fetch web pages and `jsdom` to parse HTML content.
2. **URL Resolution**: Converts relative URLs to absolute URLs using the `URL` constructor.
3. **Interactive Link Selection**: Users interactively select which links to exclude or preserve.
4. **Tree Structure Building**: Constructs a nested structure of links.
5. **Concat HTMLs**: Make a flatten text of the entire tree doc.

#### Key Features
1. **Link Extraction**: Fetches web pages and extracts links while handling various character encodings (`UTF-8`, `EUC-JP`, `SHIFT_JIS`, `ISO-2022-JP`).
2. **URL Resolution**: Resolves relative URLs to absolute URLs.
3. **Interactive Selection**:
   - Users can exclude links by entering their numbers or range of numbers.
   - Users can preserve links by prefixing with "p" (e.g., `p1` or `p1-5`).
   - Users can move to the next level of links or finish processing.
4. **Resuming**: Supports resuming the process from a saved state using selections saved in `removal_selections.txt`.

#### User Interaction
- **Input**:
  - `next`: To move to the next level of links.
  - `done`: To finish processing.
  - Number or range (e.g., `1`, `1-5`): To exclude specific links.
  - Preserve prefix (`p`): To preserve specific links (e.g., `p1`, `p1-5`).

#### Output
- **Concatenated Content**: Saves the final concatenated content of all processed links into `result.txt`.
- **Saved Selections**: Saves user selections into `removal_selections.txt` for resuming purposes.

#### Technical Details
- Implemented in Node.js.
- Uses `axios` for web requests.
- Uses `iconv-lite` for handling various character encodings.
- Uses `jsdom` for HTML parsing.
- Supports both initial processing and resuming from a saved state.

#### Limitations
- May not handle dynamically loaded content.
- Limited to a maximum number of links per page (configurable).
- May encounter issues with websites that have strict anti-scraping measures.

### Example Usage
1. **Initial Run**:
   ```sh
   node script.js
   ```
   - Enter the root URL when prompted.
   - Interact to exclude or preserve links, move to next level, or finish processing.

2. **Resume**:
   ```sh
   node script.js resume
   ```
   - Automatically applies saved selections from `removal_selections.txt` and resumes processing.
