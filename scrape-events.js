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
  
  // Extract tags for each event
  const eventCards = html.matchAll(/<div class="em-card em-event-(\d+)[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g);
  const tagsByEventId = {};
  
  for (const card of eventCards) {
    const cardHtml = card[0];
    const eventId = card[1];
    const tags = [];
    
    const tagMatches = cardHtml.matchAll(/<span class="em-card_tag(?! em-new-tag)"[^>]*>(.*?)<\/span>/g);
    for (const tagMatch of tagMatches) {
      tags.push(tagMatch[1]);
    }
    
    if (tags.length > 0) {
      tagsByEventId[eventId] = tags;
    }
  }
  
  // Add tags to events
  events.forEach(event => {
    const eventIdMatch = event.url?.match(/event\/([^\/]+)/);
    if (eventIdMatch) {
      const urlName = eventIdMatch[1];
      // Try to find matching tags
      for (const [id, tags] of Object.entries(tagsByEventId)) {
        if (event.url.includes(id)) {
          event.tags = tags;
          break;
        }
      }
    }
  });
  
  return events;
}

async function scrapeAllEvents() {
  console.log('Starting event scraper...');
  const allEvents = [];
  
  // Fetch first page to see how many pages exist
  const firstPage = await fetchPage(1);
  const firstEvents = extractEvents(firstPage);
  allEvents.push(...firstEvents);
  console.log(`Page 1: Found ${firstEvents.length} events`);
  
  // Check for max page number in pagination
  const pageMatch = firstPage.match(/\/calendar\/six_months\/\d+\/\d+\/\d+\/(\d+)/g);
  const maxPage = pageMatch ? Math.max(...pageMatch.map(p => parseInt(p.split('/').pop()))) : 1;
  
  console.log(`Total pages to scrape: ${maxPage}`);
  
  // Fetch remaining pages with delay to avoid rate limits
  for (let page = 2; page <= maxPage; page++) {
    try {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      
      const html = await fetchPage(page);
      const events = extractEvents(html);
      allEvents.push(...events);
      
      console.log(`Page ${page}/${maxPage}: Found ${events.length} events (Total: ${allEvents.length})`);
    } catch (error) {
      console.log(`Error on page ${page}:`, error.message);
    }
  }
  
  // Remove duplicates by URL
  const uniqueEvents = Array.from(
    new Map(allEvents.map(e => [e.url, e])).values()
  );
  
  console.log(`\nTotal unique events: ${uniqueEvents.length}`);
  
  // Save to file
  fs.writeFileSync('niu-events.json', JSON.stringify({
    lastUpdated: new Date().toISOString(),
    totalEvents: uniqueEvents.length,
    events: uniqueEvents
  }, null, 2));
  
  console.log('Saved to niu-events.json');
}

scrapeAllEvents().catch(console.error);
