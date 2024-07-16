const fs = require('fs');
const readline = require('readline');
const puppeteer = require('puppeteer');
const path = require('path');
const assert = require('assert');

const DEBUG = false;
const MAX_LINKS = 2000;
const CONCURRENCY_LIMIT = 10; // Adjust the concurrency limit as needed
const ROOT_URL_FILE = 'root_url.txt';
const SELECTION_FILE = 'removal_selections.txt';

// Initialize cache for visited URLs and their HTML content
const urlCache = new Map();
const htmlCache = new Map();
const shownLinks = new Set();
const preservedLinks = new Map();

let pLimit;
let applyExecuted = false;

async function loadPLimit() {
    pLimit = (await import('p-limit')).default;
}

function debug(message) {
    if (DEBUG) {
        console.error(`DEBUG: ${message}`);
    }
}

function echoErr(message) {
    console.error(message);
}

async function fetchAndParseLinks(url) {
    if (urlCache.has(url)) {
        return urlCache.get(url);
    }

    echoErr(`Fetching ${url}`);
    debug('Starting puppeteer...');
    let browser;
    let page;
    let content;
    let selector;
    try {
        browser = await puppeteer.launch();
        page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Determine the selector based on the domain
        if (url.includes('paper.dropbox.com')) {
            selector = '#editor-1';
        } else if (url.includes('scrapbox.io')) {
            selector = '#editor';
        } else {
            selector = 'body'; // Default selector for other domains
        }

        // Wait for the specific element that indicates the content is fully loaded
        await page.waitForSelector(selector);

        content = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            const header = document.getElementById('header');
            const footer = document.getElementById('footer');
            if (header) header.querySelectorAll('a[href]').forEach(a => a.remove());
            if (footer) footer.querySelectorAll('a[href]').forEach(a => a.remove());
            const links = Array.from(element.querySelectorAll('a[href]'))
                .map(a => [a.getAttribute('href'), a.textContent.trim()])
                .filter(([href, text]) => href && text);
            const bodyText = element.innerText;
            return { links, bodyText };
        }, selector);

        await browser.close();
        debug('Link extraction completed');

        urlCache.set(url, content.links);
        htmlCache.set(url, content.bodyText);  // Save the body text content for flattening
        return content.links;
    } catch (error) {
        echoErr(`Error: puppeteer failed to fetch ${url}`);
        if (browser) {
            await browser.close();
        }
        return null;
    }
}

function resolveUrl(baseUrl, href) {
    try {
        return new URL(href, baseUrl).toString();
    } catch {
        return '';
    }
}

async function fetchAllLinks(urls) {
    const limit = pLimit(CONCURRENCY_LIMIT);
    const fetchPromises = urls.map(url => limit(() => fetchAndParseLinks(url)));
    const results = await Promise.all(fetchPromises);

    let allLinks = [];
    for (let i = 0; i < results.length; i++) {
        const links = results[i];
        if (!links) continue;
        const resolvedLinks = links.map(([href, text]) => [resolveUrl(urls[i], href), text]).filter(([resolvedUrl]) => resolvedUrl);
        allLinks = [...allLinks, ...resolvedLinks];
    }
    return [...new Set(allLinks.map(JSON.stringify))].map(JSON.parse).slice(0, MAX_LINKS);
}

async function processLinks(urls, level, resume = false, savedSelections = []) {
    let allLinks = await fetchAllLinks(urls);
    allLinks.sort((a, b) => a[0].localeCompare(b[0])); // Sort links to make IDs consistent

    while (true) {
        echoErr('Remaining links:');
        displayLinks(allLinks);

        let input = await prompt('Enter the numbers of links to exclude (space-separated, use "-" for range), preserve (prefix with "p", e.g., "p1"), "next" to move to the next level, "apply" to apply past choices, or "done" to finish: ');

        if (input === 'next') {
            if (allLinks.length === 0 && preservedLinks.size === 0) {
                echoErr('No links to process. Exiting.');
                break;
            }

            const nextUrls = [];
            for (let i = 0; i < allLinks.length; i++) {
                if (!preservedLinks.has(i + 1)) {
                    nextUrls.push(allLinks[i][0]);
                }
            }
            if (nextUrls.length === 0 && preservedLinks.size > 0) {
                preservedLinks.forEach((value) => {
                    nextUrls.push(value[0]);
                });
            }
            if (nextUrls.length === 0) {
                echoErr('No links to process. Exiting.');
                break;
            }
            await processLinks(nextUrls, level + 1, resume, savedSelections);
            break;
        } else if (input === 'done') {
            return;
        } else if (input === 'apply') {
            if (applyExecuted) {
                echoErr('Cannot apply more than once.');
                continue;
            }
            const selections = savedSelections[level - 1];
            for (const selection of selections) {
                allLinks = applySelection(selection, allLinks);
            }
            applyExecuted = true;
            echoErr('Past Choice Applied.');
            displayLinks(allLinks);
        } else {
            allLinks = applySelection(input, allLinks);
            if (!resume || !savedSelections[level - 1]) saveSelection(input, level);

            echoErr('Remaining links after exclusion:');
            displayLinks(allLinks);
        }

        // Check if there are more saved selections for the current level
        if (!resume && savedSelections[level] && savedSelections[level].length > 0) {
            continue;
        }
    }
}

function applySelection(input, links) {
    const { excludeIndices, preserveIndices } = parseInput(input, links.length);
    preserveIndices.forEach(idx => {
        if (!preservedLinks.has(idx)) {
            preservedLinks.set(idx, links[idx - 1]);
        }
    });

    return links
        .filter((_, index) => !excludeIndices.has(index + 1))
        .filter((_, index) => !preserveIndices.has(index + 1));
}

function parseInput(input, length) {
    const excludeIndices = new Set();
    const preserveIndices = new Set();
    const parts = input.split(/\s+/);
    for (const part of parts) {
        if (part.startsWith('p')) {
            const range = part.slice(1);
            addRangeToSet(range, length, preserveIndices);
        } else if (part.includes('-')) {
            addRangeToSet(part, length, excludeIndices);
        } else {
            const num = Number(part);
            if (!isNaN(num) && num > 0 && num <= length) {
                excludeIndices.add(num);
            }
        }
    }
    return { excludeIndices, preserveIndices };
}

function addRangeToSet(range, length, set) {
    let isRange = range.indexOf("-") >= 0;
    let [startStr, endStr] = range.split('-');

    let start = startStr ? Number(startStr) : 1;
    let end = endStr ? Number(endStr) : undefined; // Set end to length if not provided

    // Handle open-ended preservation ranges
    if ( isRange && !end ) {
        end = length;
    }

    if (start > end) [start, end] = [end, start];

    // handle single link
    if ( !isRange && start ) {
        set.add(start);
        return;
    }

    // handle ranged link
    if (!isNaN(start) && !isNaN(end) && start > 0 && end <= length) {
        for (let i = Math.max(start, 1); i <= Math.min(end, length); i++) {
            set.add(i);
        }
    }
}
 

function displayLinks(links) {
    links.forEach(([url, text], index) => {
        if (!shownLinks.has(url)) {
            echoErr(`${index + 1}. ${text}`);
            echoErr(`   URL: ${url}`);
            echoErr('');
        }
    });
}

async function saveConcatenatedContent() {
    let concatenatedContent = '';
    for (const bodyText of htmlCache.values()) {
        concatenatedContent += bodyText + '\n\n';
    }
    await fs.promises.writeFile('result.txt', concatenatedContent, 'utf8');
    echoErr('Concatenated content saved to result.txt');
}

function saveSelection(input, level) {
    const selection = `Level ${level}: ${input}\n`;
    fs.appendFileSync(SELECTION_FILE, selection);
    echoErr(`Selection saved: ${selection.trim()}`);
}

async function loadRootUrl() {
    if (fs.existsSync(ROOT_URL_FILE)) {
        const rootUrl = await fs.promises.readFile(ROOT_URL_FILE, 'utf8');
        echoErr(`Loaded root URL from ${ROOT_URL_FILE}: ${rootUrl}`);
        return rootUrl.trim();
    } else {
        const rootUrl = await prompt('Enter the root URL: ');
        await fs.promises.writeFile(ROOT_URL_FILE, rootUrl, 'utf8');
        echoErr(`Root URL saved to ${ROOT_URL_FILE}`);
        return rootUrl;
    }
}

async function loadSavedSelections() {
    if (fs.existsSync(SELECTION_FILE)) {
        const content = await fs.promises.readFile(SELECTION_FILE, 'utf8');
        const lines = content.trim().split('\n');
        const savedSelections = [];
        for (const line of lines) {
            const [levelInfo, ids] = line.split(': ');
            const level = parseInt(levelInfo.replace('Level ', ''));
            if (!savedSelections[level - 1]) {
                savedSelections[level - 1] = [];
            }
            savedSelections[level - 1].push(ids);
        }
        return savedSelections;
    }
    return [];
}

function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => rl.question(question, answer => {
        rl.close();
        resolve(answer);
    }));
}

function generateScenarioLinks(numLinks) {
    const scenarioLinks = [];
    for (let i = 1; i <= numLinks; i++) {
        scenarioLinks.push([`url${i}`, `link ${i}`]);
    }
    return scenarioLinks;
}

async function runTests() {
    // Helper function to test parseInput and addRangeToSet
    function testParseInput(input, length, expectedExcludes, expectedPreserves) {
        const { excludeIndices, preserveIndices } = parseInput(input, length);
        console.log(`excludeIndices: ${[...excludeIndices]}`);
        console.log(`preserveIndices: ${[...preserveIndices]}`);
        assert.deepStrictEqual([...excludeIndices], expectedExcludes, `Failed excludes for input: ${input}`);
        assert.deepStrictEqual([...preserveIndices], expectedPreserves, `Failed preserves for input: ${input}`);
        console.log(`Passed: ${input}`);
    }

    // Test cases
    const tests = [
        { input: '16', length: 300, expectedExcludes: [16], expectedPreserves: [] },
        { input: '1 30', length: 300, expectedExcludes: [1, 30], expectedPreserves: [] },
        { input: '20 22-26', length: 300, expectedExcludes: [20, 22, 23, 24, 25, 26], expectedPreserves: [] },
        { input: '200-', length: 300, expectedExcludes: Array.from({ length: 101 }, (_, i) => 200 + i), expectedPreserves: [] },
        { input: '100-111', length: 300, expectedExcludes: Array.from({ length: 12 }, (_, i) => 100 + i), expectedPreserves: [] },
        { input: '-111', length: 300, expectedExcludes: Array.from({ length: 111 }, (_, i) => 1 + i), expectedPreserves: [] },
        { input: 'p20', length: 300, expectedExcludes: [], expectedPreserves: [20] },
        { input: 'p20-30', length: 300, expectedExcludes: [], expectedPreserves: Array.from({ length: 11 }, (_, i) => 20 + i) },
        { input: 'p20 10-13', length: 300, expectedExcludes: [10, 11, 12, 13], expectedPreserves: [20] },
        { input: '3 p20-22', length: 300, expectedExcludes: [3], expectedPreserves: [20, 21, 22] },
        { input: '2 100-', length: 300, expectedExcludes: [2, ...Array.from({ length: 201 }, (_, i) => 100 + i)], expectedPreserves: [] },
        { input: 'p3 p33-', length: 300, expectedExcludes: [], expectedPreserves: [3, ...Array.from({ length: 268 }, (_, i) => 33 + i)] },
    ];

    // Run tests
    tests.forEach(({ input, length, expectedExcludes, expectedPreserves }) => {
        testParseInput(input, length, expectedExcludes, expectedPreserves);
    });

    console.log('All tests passed.');

    // Scenario test
    console.log('Running scenario test...');
    let scenarioLinks = generateScenarioLinks(1000);  // Generate 1000 links

    // Simulate applying initial levels
    const savedSelections = [
        '658-', '608-', '524-', '453-', '292-', '269-', 'p249-', '186-', 'p122', '122-'
    ];

    for (const selection of savedSelections) {
        let scenarioLinksBefore1 = scenarioLinks.length;
        console.log(`Applying selection: ${selection}`);
        scenarioLinks = applySelection(selection, scenarioLinks);
        console.log(`Scenario links before: ${scenarioLinksBefore1}, after: ${scenarioLinks.length}`);
        assert(scenarioLinks.length < scenarioLinksBefore1, "scenarioLinks must be reduced.");
    }

    // Now try preservation before the final apply
    let input = 'p10';
    let scenarioLinksBefore2 = scenarioLinks.length;
    let preservedLinksBefore1 = preservedLinks.size;
    console.log(`Applying preservation: ${input}`);
    scenarioLinks = applySelection(input, scenarioLinks);
    console.log(`Scenario links before: ${scenarioLinksBefore2}, after: ${scenarioLinks.length}`);
    console.log(`Preserved links before: ${preservedLinksBefore1}, after: ${preservedLinks.size}`);
    assert(scenarioLinks.length < scenarioLinksBefore2, "scenarioLinks must be reduced.");
    assert(preservedLinks.size > preservedLinksBefore1, "preservedLinks must be increased.");

    // Now apply the final selection to clear links
    input = '1-';
    let scenarioLinksBefore3 = scenarioLinks.length;
    console.log(`Applying final selection: ${input}`);
    scenarioLinks = applySelection(input, scenarioLinks);
    console.log(`Scenario links before: ${scenarioLinksBefore3}, after: ${scenarioLinks.length}`);
    assert(scenarioLinks.length < scenarioLinksBefore3, "scenarioLinks must be reduced.");

    console.log("All scenario test passed.");
}



async function main() {
    await loadPLimit(); // Load p-limit before using it

    const args = process.argv.slice(2);
    if (args[0] === 'test') {
        await runTests();
        return;
    }

    const rootUrl = await loadRootUrl();
    const initialUrls = [rootUrl];
    const savedSelections = await loadSavedSelections();

    await processLinks(initialUrls, 1, true, savedSelections);

    await saveConcatenatedContent();
    echoErr('Tree building complete.');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

module.exports = {
    parseInput,
    addRangeToSet,
    fetchAndParseLinks,
    resolveUrl,
    fetchAllLinks,
    processLinks,
    saveConcatenatedContent,
    saveSelection,
    loadRootUrl,
    loadSavedSelections
};
