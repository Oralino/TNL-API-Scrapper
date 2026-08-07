const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Global memory cache for the scraped items
let cachedPotentialsData = [];
let isScraping = false;

// Helper function to extract all lists from nested JSON
function extractAllLists(data) {
    let foundLists = [];
    if (Array.isArray(data)) {
        foundLists.push(data);
        for (const item of data) {
            foundLists = foundLists.concat(extractAllLists(item));
        }
    } else if (data !== null && typeof data === 'object') {
        for (const value of Object.values(data)) {
            foundLists = foundLists.concat(extractAllLists(value));
        }
    }
    return foundLists;
}

// Helper function to locate the largest array in the JSON response
function findMainDataset(data) {
    const allLists = extractAllLists(data);
    if (allLists.length === 0) return [];
    return allLists.reduce((max, current) => (current.length > max.length ? current : max), []);
}

// Core scraping function
async function scrapePotentialsData() {
    if (isScraping) return;
    isScraping = true;

    let capturedData = null;
    const userDataDir = path.join(process.cwd(), 'browser_profile');

    // Check if a saved session profile exists
    const profileExists = fs.existsSync(userDataDir) && fs.readdirSync(userDataDir).length > 0;
    const isHeadless = profileExists;

    console.log(
        isHeadless
            ? 'Updating data silently in background...'
            : 'First-time setup detected. Please log in using the opened browser window.'
    );

    try {
        // Launch persistent context using automated headless mode selection
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: isHeadless,
        });

        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

        // Intercept network responses to catch region 60005 data
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('api.potentials.ashx') && url.includes('region=60005')) {
                try {
                    capturedData = await response.json();
                } catch (e) {
                    // Ignore non-json parsing errors
                }
            }
        });

        await page.goto('https://tl-tracker.com/potentials');

        // Wait 180 seconds for initial manual login, or 30 seconds for background refresh
        const maxWaitSeconds = !isHeadless ? 180 : 30;

        for (let i = 0; i < maxWaitSeconds; i++) {
            if (capturedData) break;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await context.close();

        if (capturedData) {
            const rawItems = findMainDataset(capturedData);
            const targetKeys = ['label', 'kind', 'listed', 'floor', 'listings'];

            // Filter and structure the exact fields needed
            cachedPotentialsData = rawItems
                .filter((item) => typeof item === 'object' && item !== null)
                .map((item) => {
                    const filteredItem = {};
                    targetKeys.forEach((key) => {
                        filteredItem[key] = item[key] !== undefined ? item[key] : null;
                    });
                    return filteredItem;
                });

            console.log(`Data refreshed successfully! Total items: ${cachedPotentialsData.length}`);
        } else {
            console.log('Failed to capture region 60005 data.');
        }
    } catch (error) {
        console.error(`Error during scrape: ${error.message}`);
    } finally {
        isScraping = false;
    }
}

// Background loop to trigger scrapes every 5 minutes (300,000 ms)
function startBackgroundScraper() {
    scrapePotentialsData(); // Initial run on launch
    setInterval(() => {
        scrapePotentialsData();
    }, 300000);
}

// Define the website API endpoint
app.get('/market-potentials', (req, res) => {
    if (cachedPotentialsData.length === 0 && isScraping) {
        return res.json({
            status: 'pending',
            message: 'Initial data scrape is currently in progress. Please refresh in a few seconds.',
            data: [],
        });
    }

    res.json({
        status: 'success',
        count: cachedPotentialsData.length,
        data: cachedPotentialsData,
    });
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Node.js web server running on http://localhost:${PORT}`);
    startBackgroundScraper();
});