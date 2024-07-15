const fs = require('fs');
const readline = require('readline');
const puppeteer = require('puppeteer');
const path = require('path');

const DEBUG = false;
const MAX_LINKS = 2000;
const CONCURRENCY_LIMIT = 10; // Adjust the concurrency limit as needed
const ROOT_URL_FILE = 'root_url.txt';
const SELECTION_FILE = 'removal_selections.txt';

// Initialize cache for visited URLs and their HTML content
const urlCache = new Map();
const htmlCache = new Map();
const shownLinks = new Set();

let pLimit;

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
    let preservedLinks = new Set();

    while (true) {
        echoErr('Remaining links:');
        displayLinks(allLinks, preservedLinks);

        let input;
        if (resume && savedSelections[level - 1]) {
            const selections = savedSelections[level - 1];
            for (const selection of selections) {
                allLinks = applySelection(selection, allLinks, preservedLinks);
            }
            resume = false;  // Disable resume after applying saved selections
        } else {
            input = await prompt('Enter the numbers of links to exclude (space-separated, use "-" for range), preserve (prefix with "p", e.g., "p1"), "next" to move to the next level, or "done" to finish: ');

            if (input === 'next') {
                const nextUrls = [];
                for (let i = 0; i < allLinks.length; i++) {
                    if (!preservedLinks.has(i + 1)) {
                        nextUrls.push(allLinks[i][0]);
                    }
                }
                if (nextUrls.length === 0 && preservedLinks.size > 0) {
                    nextUrls.push(...[...preservedLinks].map(idx => allLinks[idx - 1][0]));
                }
                if (nextUrls.length === 0) {
                    echoErr('No links to process. Exiting.');
                    break;
                }
                await processLinks(nextUrls, level + 1, resume, savedSelections);
                break;
            } else if (input === 'done') {
                return;
            } else {
                allLinks = applySelection(input, allLinks, preservedLinks);
                if (!resume || !savedSelections[level - 1]) saveSelection(input, level);

                echoErr('Remaining links after exclusion:');
                displayLinks(allLinks, preservedLinks);
            }
        }

        // Check if there are more saved selections for the current level
        if (!resume && savedSelections[level] && savedSelections[level].length > 0) {
            continue;
        } else {
            input = await prompt('Enter the numbers of links to exclude (space-separated, use "-" for range), preserve (prefix with "p", e.g., "p1"), "next" to move to the next level, or "done" to finish: ');

            if (input === 'next') {
                const nextUrls = [];
                for (let i = 0; i < allLinks.length; i++) {
                    if (!preservedLinks.has(i + 1)) {
                        nextUrls.push(allLinks[i][0]);
                    }
                }
                if (nextUrls.length === 0 && preservedLinks.size > 0) {
                    nextUrls.push(...[...preservedLinks].map(idx => allLinks[idx - 1][0]));
                }
                if (nextUrls.length === 0) {
                    echoErr('No links to process. Exiting.');
                    break;
                }
                await processLinks(nextUrls, level + 1, resume, savedSelections);
                break;
            } else if (input === 'done') {
                return;
            } else {
                allLinks = applySelection(input, allLinks, preservedLinks);
                saveSelection(input, level);

                echoErr('Remaining links after exclusion:');
                displayLinks(allLinks, preservedLinks);
            }
        }
    }
}

function applySelection(input, links, preservedLinks) {
    const { excludeIndices, preserveIndices } = parseInput(input, links.length);
    preserveIndices.forEach(idx => preservedLinks.add(idx));

    return links.filter((_, index) => !excludeIndices.has(index + 1));
}

function parseInput(input, length) {
    const excludeIndices = new Set();
    const preserveIndices = new Set();
    const parts = input.split(/\s+/);
    for (const part of parts) {
        if (part.startsWith('p')) {
            const range = part.slice(1);
            addRangeToSet(range, length, preserveIndices, true);
        } else if (part.includes('-')) {
            addRangeToSet(part, length, excludeIndices, false);
        } else {
            const num = Number(part);
            if (!isNaN(num) && num > 0 && num <= length) {
                excludeIndices.add(num);
            }
        }
    }
    return { excludeIndices, preserveIndices };
}

function addRangeToSet(range, length, set, isPreserve) {
    let [startStr, endStr] = range.split('-');
    let start = startStr ? Number(startStr) : 1;
    let end = endStr ? Number(endStr) : (isPreserve ? length : start);
    if (start > end) [start, end] = [end, start];
    if (!isNaN(start) && !isNaN(end) && start > 0 && end <= length) {
        for (let i = Math.max(start, 1); i <= Math.min(end, length); i++) {
            set.add(i);
        }
    }
}

function displayLinks(links, preservedLinks) {
    links.forEach(([url, text], index) => {
        if (!shownLinks.has(url) && !preservedLinks.has(index + 1)) {
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

async function main() {
    await loadPLimit(); // Load p-limit before using it

    const rootUrl = await loadRootUrl();
    const initialUrls = [rootUrl];
    const savedSelections = await loadSavedSelections();

    const args = process.argv.slice(2);
    if (args[0] === 'resume') {
        echoErr('Resuming with saved selections...');
        await processLinks(initialUrls, 1, true, savedSelections);
    } else {
        await processLinks(initialUrls, 1);
    }

    await saveConcatenatedContent();
    echoErr('Tree building complete.');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
