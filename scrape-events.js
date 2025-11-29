const https = require('https');
const fs = require('fs');

async function fetchPage(pageNum) {
  return new Promise((resolve, reject) => {
    const url = `https://calendar.niu.edu/calendar/six_months/2025/11/27/${pageNum}`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractEvents(html) {
  const events = [];
  const regex = /<script type="application\/ld\+json">\[(.*?)\]<\/script>/gs;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    try {
      const eventData = JSON.parse(`[${match[1]}]`);
      events.push(...eventData);
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  }
  
  return events;
}

function extractTags(html) {
  const tagsByUrl = {};
  
  const cards = html.split('<div class="em-card ');
  
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    
    const urlMatch = card.match(/href="(https:\/\/calendar\.niu\.edu\/event\/[^"]+)"/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    
    const tags = [];
    const tagMatches = card.matchAll(/<span class="em-card_tag(?! em-new-tag)"[^>]*>(.*?)<\/span>/g);
    
    for (const tagMatch of tagMatches) {
      tags.push(tagMatch[1].trim());
    }
    
    if (tags.length > 0) {
      tagsByUrl[url] = tags;
    }
  }
  
  return tagsByUrl;
}

async function scrapeAllEvents() {
  console.log('Starting event scraper...');
  const allEvents = [];
  const allTags = {};
  
  console.log('Fetching page 1...');
  const firstPage = await fetchPage(1);
  
  console.log(`Page length: ${firstPage.length} characters`);
  console.log(`First 500 chars: ${firstPage.substring(0, 500)}`);
  console.log(`Contains "application/ld+json": ${firstPage.includes('application/ld+json')}`);
  console.log(`Contains "em-card": ${firstPage.includes('em-card')}`);
  
  const firstEvents = extractEvents(firstPage);
  const firstTags = extractTags(firstPage);
  
  allEvents.push(...firstEvents);
  Object.assign(allTags, firstTags);
  
  console.log(`Page 1: Found ${firstEvents.length} events, ${Object.keys(firstTags).length} with tags`);
  
  const pageMatch = firstPage.match(/\/calendar\/six_months\/\d+\/\d+\/\d+\/(\d+)/g);
  const maxPage = pageMatch ? Math.max(...pageMatch.map(p => parseInt(p.split('/').pop()))) : 1;
  
  console.log(`Total pages to scrape: ${maxPage}`);
  
  // Fetch remaining pages with delay
  for (let page = 2; page <= maxPage; page++) {
    try {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
      
      console.log(`Fetching page ${page}...`);
      const html = await fetchPage(page);
      const events = extractEvents(html);
      const tags = extractTags(html);
      
      allEvents.push(...events);
      Object.assign(allTags, tags);
      
      console.log(`Page ${page}/${maxPage}: Found ${events.length} events (Total: ${allEvents.length})`);
    } catch (error) {
      console.log(`Error on page ${page}:`, error.message);
    }
  }
  
  const uniqueEvents = Array.from(
    new Map(allEvents.map(e => [e.url, e])).values()
  );
  
  uniqueEvents.forEach(event => {
    if (allTags[event.url]) {
      event.tags = allTags[event.url];
    }
  });
  
  console.log(`\nTotal unique events: ${uniqueEvents.length}`);
  console.log(`Events with tags: ${uniqueEvents.filter(e => e.tags).length}`);
  
  fs.writeFileSync('niu-events.json', JSON.stringify({
    lastUpdated: new Date().toISOString(),
    totalEvents: uniqueEvents.length,
    events: uniqueEvents
  }, null, 2));
  
  console.log('Saved to niu-events.json');
}

scrapeAllEvents().catch(console.error);
