const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const port = 7777; // Changer le port à 7777

const MAX_RETRIES = 3; // Nombre maximum de tentatives
const RETRY_DELAY = 15000; // Délai entre les tentatives en millisecondes

app.get('/captcha/:siteKey', async (req, res) => {
    const siteKey = req.params.siteKey;
    const headless = req.query.headless !== 'true'; // Par défaut, headless est true
    const useProxy = req.query.proxy === 'true'; // Par défaut, pas de proxy
    const proxyServer = 'http://your-proxy-server:port'; // Remplacez par votre serveur proxy

    if (!siteKey) {
        return res.status(400).send('Site key is required');
    }

    let retries = 0;

    const solveChallenge = async () => {
        try {
            console.log(`Operation started for site key: ${siteKey}`);

            const browser = await puppeteer.launch({
                headless: headless,
                args: useProxy ? [`--proxy-server=${proxyServer}`] : []
            });
            console.log(`Browser launched.`);

            const page = await browser.newPage();
            console.log(`New page opened.`);

            // Ouvrir une page vide
            await page.goto('about:blank', { waitUntil: 'networkidle2', timeout: 60000 });
            console.log(`Navigation to about:blank complete.`);

            // Injecter le script reCAPTCHA v3
            await page.evaluate((siteKey) => {
                const script = document.createElement('script');
                script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
                script.async = true;
                script.defer = true;
                document.head.appendChild(script);
            }, siteKey);

            console.log(`reCAPTCHA v3 script injected.`);

            // Attendre que le reCAPTCHA v3 soit chargé
            await page.waitForFunction(() => {
                return typeof grecaptcha !== 'undefined' && grecaptcha.ready;
            }, { timeout: 30000 });

            console.log(`reCAPTCHA v3 loaded.`);

            // Générer le token reCAPTCHA v3
            const token = await page.evaluate(async (siteKey) => {
                return new Promise((resolve, reject) => {
                    grecaptcha.ready(function() {
                        grecaptcha.execute(siteKey, {action: 'homepage'}).then(function(token) {
                            resolve(token);
                        }).catch(function(error) {
                            reject(error);
                        });
                    });
                });
            }, siteKey);

            console.log(`reCAPTCHA v3 token generated:`, token);

            await browser.close();
            console.log(`Browser closed.`);
            console.log(`Operation completed for site key: ${siteKey}`);

            return { token };
        } catch (error) {
            console.error('Error:', error);
            if (retries < MAX_RETRIES) {
                retries++;
                console.log(`Retrying... Attempt ${retries}`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return solveChallenge();
            } else {
                throw error;
            }
        }
    };

    try {
        const result = await solveChallenge();
        res.status(200).json(result);
    } catch (error) {
        res.status(500).send('An error occurred');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
