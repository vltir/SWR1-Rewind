import axios from 'axios';
import fs from 'fs';

// Die URL der Abstimmung/Hitparade
const BASE_URL = "https://www.swr-vote.de/swr1bw-hitparade-2025";

// Anzahl der Seiten
const MAX_PAGES = 106;
const OUTPUT_FILE = 'public/swr1_songs.json';

async function scrapeSWR() {
    let allSongs = [];
    console.log("🚀 Starte SWR1 Scraper (ES Module Version)...");

    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${BASE_URL}?p=${page}`;

        try {
            // Kleiner Trick für den Output ohne Zeilenumbruch
            process.stdout.write(`⏳ Scrape Seite ${page}/${MAX_PAGES}... `);

            const response = await axios.get(url);
            const html = response.data;

            // Der verbesserte Regex von vorhin
            const regex = /\\"title\\":\\"(?<title>(?:(?!\\",\\").)*?)\\",\\"artist\\":\\"(?<artist>.*?)\\",.*?\\"teaserURL\\":\\"(?<url>.*?)\\"/g;

            let match;
            let countOnPage = 0;

            while ((match = regex.exec(html)) !== null) {
                const title = match.groups.title;
                const artist = match.groups.artist;
                const rawUrl = match.groups.url;

                try {
                    const cleanUrl = JSON.parse(`"${rawUrl}"`);
                    const cleanTitle = JSON.parse(`"${title}"`);
                    const cleanArtist = JSON.parse(`"${artist}"`);

                    if (cleanUrl && cleanUrl.includes('.mp3')) {
                        allSongs.push({
                            id: 0, // Platzhalter, wird unten neu gesetzt
                            artist: cleanArtist,
                            title: cleanTitle,
                            audio: cleanUrl
                        });
                        countOnPage++;
                    }
                } catch (e) {
                    // Falls JSON.parse mal fehlschlägt (selten)
                }
            }

            console.log(`✅ ${countOnPage} gefunden.`);

        } catch (error) {
            console.log(`❌ Fehler: ${error.message}`);
        }
    }

    // Dubletten entfernen
    const uniqueSongs = [...new Map(allSongs.map(item => [item['audio'], item])).values()];

    // IDs neu durchnummerieren
    uniqueSongs.forEach((song, index) => {
        song.id = index + 1;
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueSongs, null, 2));

    console.log("------------------------------------------------");
    console.log(`🎉 FERTIG! ${uniqueSongs.length} Songs gespeichert.`);
    console.log(`📁 Datei liegt bereit in: ${OUTPUT_FILE}`);
}

scrapeSWR();