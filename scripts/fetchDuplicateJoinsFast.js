const axios = require('axios');

const API_BASE_URL = 'https://backend2.rallysports.ae/api';

async function findDuplicateJoinsFast() {
  try {
    console.log('🔄 Fetching all events from the live API...');
    let allEvents = [];
    let page = 1;
    let hasMore = true;

    // Fetch all events
    while (hasMore) {
      console.log(`Fetching events page ${page}...`);
      const response = await axios.get(`${API_BASE_URL}/events/all?page=${page}&limit=50`);
      if (!response.data || !response.data.success) {
        throw new Error('Failed to fetch events');
      }
      const events = response.data.data.events;
      allEvents = allEvents.concat(events);

      const pagination = response.data.data.pagination;
      if (!pagination.hasNextPage) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log(`✅ Found ${allEvents.length} events. Now fetching participants concurrently...`);

    const duplicateEvidence = [];
    let completed = 0;

    const fetchParticipantsForEvent = async (event) => {
      if (event.visibility === 'private') {
        completed++;
        return;
      }

      let participants = [];
      let pPage = 1;
      let pHasMore = true;

      while (pHasMore) {
        try {
          const pResponse = await axios.get(`${API_BASE_URL}/events/${event.eventId}/participants?page=${pPage}`);
          if (pResponse.data && pResponse.data.success) {
            participants = participants.concat(pResponse.data.data.participants);
            if (!pResponse.data.data.pagination.hasNextPage) {
              pHasMore = false;
            } else {
              pPage++;
            }
          } else {
            pHasMore = false;
          }
        } catch (err) {
          pHasMore = false;
        }
      }

      // Check for duplicates
      const userCounts = {};
      for (const participant of participants) {
        const uid = participant.userId;
        if (!userCounts[uid]) {
          userCounts[uid] = { count: 0, details: participant };
        }
        userCounts[uid].count++;
      }

      for (const [uid, data] of Object.entries(userCounts)) {
        if (data.count > 1) {
          duplicateEvidence.push({
            eventId: event.eventId,
            eventName: event.eventName,
            userId: uid,
            userName: data.details.fullName,
            duplicateCount: data.count
          });
        }
      }

      completed++;
      if (completed % 20 === 0) {
        console.log(`... checked ${completed}/${allEvents.length} events ...`);
      }
    };

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < allEvents.length; i += batchSize) {
      const batch = allEvents.slice(i, i + batchSize);
      await Promise.all(batch.map(fetchParticipantsForEvent));
    }

    console.log('\n======================================================');
    console.log('🔍 DUPLICATE JOIN EVIDENCE FOUND IN PRODUCTION:');
    console.log('======================================================');
    
    if (duplicateEvidence.length > 0) {
      console.table(duplicateEvidence);
      console.log(`\nFound ${duplicateEvidence.length} instances where a user joined the SAME event multiple times.`);
      console.log('These duplicates are the exact reason why MongoDB rejected the "unique" index constraint.');
    } else {
      console.log('No duplicates found in public events.');
    }

  } catch (error) {
    console.error('❌ Script failed:', error.message);
  }
}

findDuplicateJoinsFast();
