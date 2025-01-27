const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const port = 3333; // port

const MAX_RETRIES = 3; // retry
const RETRY_DELAY = 15000; // timeout

app.get('/cfbypass/*', async (req, res) => {
    const encodedUrl = req.params[0];
    const url = decodeURIComponent(encodedUrl);
    const headless = req.query.headless !== 'false'; // mode headless 
    const useProxy = req.query.proxy === 'true'; // pas de proxy
    const proxyServer = '';

    if (!url) {
        return res.status(400).send('URL is required');
    }

    let retries = 0;

    const fetchCookies = async () => {
        try {
            console.log(`Operation started for URL: ${url}`);

            const browser = await puppeteer.launch({
                headless: headless,
                args: useProxy ? [`--proxy-server=${proxyServer}`] : []
            });
            console.log(`Browser launched.`);

            const page = await browser.newPage();
            console.log(`New page opened.`);

            console.log(`Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); //timeout
            console.log(`Navigation complete.`);

            const isCloudflareChallenge = await page.evaluate(() => {
                return document.querySelector('#challenge-form') !== null;
            });

            if (isCloudflareChallenge) {
                console.log(`Cloudflare challenge detected.`);
                await new Promise(resolve => setTimeout(resolve, 10000)); // Attendre 10 secondes pour le défi Cloudflare
                console.log(`Waited for Cloudflare challenge resolution.`);

                console.log(`Re-navigating to ${url}...`);
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Augmenter le délai d'attente
                console.log(`Re-navigation complete.`);
            }

            console.log(`Waiting for cookies to be set...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Attendre 5 secondes pour les cookies
            console.log(`Waited for cookies to be set.`);

            const cookies = await page.cookies();
            console.log(`Cookies retrieved:`, cookies);

            await browser.close();
            console.log(`Browser closed.`);
            console.log(`Operation completed for URL: ${url}`);

            if (cookies.length > 0) {
                return cookies;
            } else {
                throw new Error('No cookies retrieved');
            }
        } catch (error) {
            console.error('Error:', error);
            if (retries < MAX_RETRIES) {
                retries++;
                console.log(`Retrying... Attempt ${retries}`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return fetchCookies();
            } else {
                throw error;
            }
        }
    };

    try {
        const cookies = await fetchCookies();
        res.status(200).json(cookies);
    } catch (error) {
        res.status(500).send('An error occurred');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
