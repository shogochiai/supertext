# Supertext

Supertext is a Node.js script that creates a tree structure of web links, allowing users to selectively explore and exclude links from a given starting URL. It includes functionality to resume processing from a saved state and saves the concatenated content of the processed links into a readable text file.

## Features

1. **Link Extraction**: Fetches web pages and extracts links, handling dynamic content with Puppeteer.
2. **Domain-specific Selectors**: Uses specific selectors for `paper.dropbox.com` and `scrapbox.io` to ensure accurate content extraction.
3. **Interactive Link Selection**: Users can interactively select which links to exclude or preserve.
4. **Resuming**: Supports resuming the process from a saved state using selections saved in `removal_selections.txt`.
5. **Concatenated Content**: Saves the final concatenated content of all processed links into `result.txt`.

## Installation

1. Clone the repository:

    ```sh
    git clone git@github.com:shogochiai/supertext.git
    cd supertext
    ```

2. Install dependencies:

    ```sh
    npm install
    ```

3. Make sure you have Node.js and npm installed.

## Usage

1. **Initial Run**:

    ```sh
    node supertext.js
    ```

    - Enter the root URL when prompted.
    - Interact to exclude or preserve links, move to the next level, or finish processing.

2. **Resume**:

    ```sh
    node supertext.js resume
    ```

    - Automatically applies saved selections from `removal_selections.txt` and resumes processing.

## Interactive Commands

- **next**: Move to the next level of links.
- **done**: Finish processing.
- **Exclude links**: Enter the numbers of links to exclude (space-separated, use "-" for range).
- **Preserve links**: Enter numbers prefixed with "p" (e.g., `p1`, `p1-5`).

## Files

- `root_url.txt`: Stores the root URL for processing.
- `removal_selections.txt`: Stores user selections for excluding or preserving links, used for resuming.
- `result.txt`: Contains the final concatenated content of all processed links.

## Example

```sh
$ node supertext.js
Loaded root URL from root_url.txt: https://paper.dropbox.com/doc/Example--CS9RE~BK8eeyOTv0w6kWlu9YAg
Fetching https://paper.dropbox.com/doc/Example--CS9RE~BK8eeyOTv0w6kWlu9YAg
Remaining links:
1. Example Link 1
   URL: https://example.com/1

2. Example Link 2
   URL: https://example.com/2

Enter the numbers of links to exclude (space-separated, use "-" for range), preserve (prefix with "p", e.g., "p1"), "next" to move to the next level, or "done" to finish:
```

## Technical Details

- **Puppeteer**: Used for fetching and parsing links from dynamically loaded content.
- **File System**: Saves and loads selections and root URL for resuming.
- **Interactive CLI**: Uses readline for user interaction.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

