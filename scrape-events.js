const https = require('https');
const fs = require('fs');

async function fetchPage(pageNum) {
  return new Promise((resolve, reject) => {
    const url = `https://calendar.niu.edu/calendar/six_months/2025/11/27/${pageNum}`;
    
    https.get(url, (res) => {
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
  
  // Find all event cards
  const cards = html.split('<div class="em-card ');
  
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    
    // Extract URL
    const urlMatch = card.match(/href="(https:\/\/calendar\.niu\.edu\/event\/[^"]+)"/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    
    // Extract tags
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
  
  // Fetch first page
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
  
  // Find max page number
  const pageMatch = firstPage.match(/\/calendar\/six_months\/\d+\/\d+\/\d+\/(\d+)/g);
  const maxPage = pageMatch ? Math.max(...pageMatch.map(p => parseInt(p.split('/').pop()))) : 1;
  
  console.log(`Total pages to scrape: ${maxPage}`);
  
  // Save what we got (even if empty) for debugging
  fs.writeFileSync('debug-page1.html', firstPage);
  console.log('Saved first page to debug-page1.html');
  
  // Remove duplicates
  const uniqueEvents = Array.from(
    new Map(allEvents.map(e => [e.url, e])).values()
  );
  
  // Attach tags to events
  uniqueEvents.forEach(event => {
    if (allTags[event.url]) {
      event.tags = allTags[event.url];
    }
  });
  
  console.log(`\nTotal unique events: ${uniqueEvents.length}`);
  console.log(`Events with tags: ${uniqueEvents.filter(e => e.tags).length}`);
  
  // Save to file
  fs.writeFileSync('niu-events.json', JSON.stringify({
    lastUpdated: new Date().toISOString(),
    totalEvents: uniqueEvents.length,
    events: uniqueEvents
  }, null, 2));
  
  console.log('Saved to niu-events.json');
}
scrapeAllEvents().catch(console.error);
