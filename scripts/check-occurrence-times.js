require('dotenv').config();
const jwt = require('jsonwebtoken');
const { connectDB, getDB, closeDB } = require('../src/config/database');
const Event = require('../src/models/Event');

const TEST_EVENT_NAME = `__CHECK_OCCURRENCES_${Date.now()}__`;

async function verifyOccurrenceTimes() {
  await connectDB();
  const db = getDB();
  
  try {
    const organiser = await db.collection('users').findOne({ userType: 'organiser' });
    const token = jwt.sign({ userId: organiser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const baseStartTime = '2026-08-03T14:30:00.000Z'; // Monday 14:30 UTC
    const baseEndTime   = '2026-08-03T16:00:00.000Z'; // Monday 16:00 UTC (1.5h duration)

    console.log(`\nBase Start Time: ${baseStartTime}`);
    console.log(`Base End Time:   ${baseEndTime}`);
    console.log(`Frequency:       Weekly (Mon, Wed, Fri) for 2 weeks\n`);

    const payload = {
      eventName: TEST_EVENT_NAME,
      eventType: 'social',
      eventSports: ['padel'],
      eventDateTime: baseStartTime,
      eventEndDateTime: baseEndTime,
      eventFrequency: ['weekly', 'mon', 'wed', 'fri'],
      recurrenceWeeks: 2,
      eventMaxGuest: 8,
      eventPricePerGuest: 100,
      eventLocation: 'Radel Court Dubai'
    };

    const response = await fetch('http://localhost:8080/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const body = await response.json();
    if (response.status !== 201 || !body.success) {
      throw new Error(`API failed: ${JSON.stringify(body)}`);
    }

    const createdEvents = body.data?.events || [];
    console.log(`Created ${createdEvents.length} events. Listing exact start and end times:\n`);
    console.log('Index | Event ID | Day | ISO Start Time           | ISO End Time             | Duration');
    console.log('-----------------------------------------------------------------------------------------');

    createdEvents.forEach((evt, i) => {
      const start = new Date(evt.eventDateTime);
      const end   = new Date(evt.eventEndDateTime);
      const dayStr = start.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      const durationMin = (end.getTime() - start.getTime()) / (1000 * 60);
      console.log(
        `${String(i + 1).padStart(5)} | ${evt.eventId.padEnd(8)} | ${dayStr} | ${start.toISOString()} | ${end.toISOString()} | ${durationMin}m`
      );
    });

    // Cleanup
    await db.collection('events').deleteMany({ eventName: TEST_EVENT_NAME });
    await Event.updateEventsCount(organiser._id, -createdEvents.length);
    console.log('\n✅ Verified and cleaned up test records successfully.\n');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await closeDB();
  }
}

verifyOccurrenceTimes();
