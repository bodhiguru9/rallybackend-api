const { getDB } = require('../config/database');

/**
 * Counter Model
 * Manages sequential counters for user IDs
 */
class Counter {
  /**
   * Get next user ID (atomic operation - thread-safe for high traffic)
   * Uses MongoDB's atomic $inc operation to ensure no ID collisions
   */
  static async getNextUserId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    // Use findOneAndUpdate with upsert for atomic operation
    // This ensures thread-safety even under high concurrent load
    const result = await countersCollection.findOneAndUpdate(
      { _id: 'userId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true, // Create if doesn't exist
        returnDocument: 'after', // Return updated document
        // Add write concern for high traffic scenarios
        writeConcern: { w: 'majority' }
      }
    );

    // Handle different MongoDB driver response formats
    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return updatedCounter.sequence;
    }

    // Fallback: if counter was just created, it should be 1
    // But we need to increment it, so try again
    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'userId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    return fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
  }

  /**
   * Get current user ID (without incrementing)
   */
  static async getCurrentUserId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'userId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Reset user counter (admin function)
   */
  static async resetUserIdCounter(startFrom = 1) {
    const db = getDB();
    const countersCollection = db.collection('counters');

    await countersCollection.updateOne(
      { _id: 'userId' },
      { $set: { sequence: startFrom } },
      { upsert: true }
    );

    return startFrom;
  }

  /**
   * Get next event ID (atomic operation - thread-safe for high traffic)
   * Uses MongoDB's atomic $inc operation to ensure no ID collisions
   */
  static async getNextEventId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    // Use findOneAndUpdate with upsert for atomic operation
    const result = await countersCollection.findOneAndUpdate(
      { _id: 'eventId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true, // Create if doesn't exist
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return updatedCounter.sequence;
    }

    // Fallback
    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'eventId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    return fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
  }

  /**
   * Get current event ID (without incrementing)
   */
  static async getCurrentEventId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'eventId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Reset event counter (admin function)
   */
  static async resetEventIdCounter(startFrom = 1) {
    const db = getDB();
    const countersCollection = db.collection('counters');

    await countersCollection.updateOne(
      { _id: 'eventId' },
      { $set: { sequence: startFrom } },
      { upsert: true }
    );

    return startFrom;
  }

  /**
   * Get next request ID (for waitlist - returns number)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextRequestId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'requestId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return updatedCounter.sequence;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'requestId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    return fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
  }

  /**
   * Get next join request ID (for organiser join requests - returns R1, R2, R3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextJoinRequestId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'joinRequestId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `R${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'joinRequestId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `R${sequence}`;
  }

  /**
   * Get current request ID (without incrementing)
   */
  static async getCurrentRequestId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'requestId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Reset request counter (admin function)
   */
  static async resetRequestIdCounter(startFrom = 1) {
    const db = getDB();
    const countersCollection = db.collection('counters');

    await countersCollection.updateOne(
      { _id: 'requestId' },
      { $set: { sequence: startFrom } },
      { upsert: true }
    );

    return startFrom;
  }

  /**
   * Get next waitlist ID (returns W1, W2, W3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextWaitlistId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'waitlistId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `W${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'waitlistId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `W${sequence}`;
  }

  /**
   * Get current waitlist ID (without incrementing)
   */
  static async getCurrentWaitlistId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'waitlistId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Reset waitlist counter (admin function)
   */
  static async resetWaitlistIdCounter(startFrom = 1) {
    const db = getDB();
    const countersCollection = db.collection('counters');

    await countersCollection.updateOne(
      { _id: 'waitlistId' },
      { $set: { sequence: startFrom } },
      { upsert: true }
    );

    return startFrom;
  }

  /**
   * Get next promo code ID (returns PRO1, PRO2, PRO3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextPromoCodeId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'promoCodeId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `PRO${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'promoCodeId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `PRO${sequence}`;
  }

  /**
   * Get current promo code ID (without incrementing)
   */
  static async getCurrentPromoCodeId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'promoCodeId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Get next payment ID (returns PAY1, PAY2, PAY3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextPaymentId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    // Use findOneAndUpdate with upsert for atomic operation
    const result = await countersCollection.findOneAndUpdate(
      { _id: 'paymentId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `PAY${updatedCounter.sequence}`;
    }

    // Fallback
    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'paymentId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `PAY${sequence}`;
  }

  /**
   * Get current payment ID (without incrementing)
   */
  static async getCurrentPaymentId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'paymentId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Get next sport ID (returns SP1, SP2, SP3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextSportId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'sportId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `SP${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'sportId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `SP${sequence}`;
  }

  /**
   * Get current sport ID (without incrementing)
   */
  static async getCurrentSportId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'sportId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Get next favorite ID (returns FAV1, FAV2, FAV3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextFavoriteId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'favoriteId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `FAV${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'favoriteId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `FAV${sequence}`;
  }

  /**
   * Get current favorite ID (without incrementing)
   */
  static async getCurrentFavoriteId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'favoriteId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Get next package ID (returns PKG1, PKG2, PKG3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextPackageId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'packageId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `PKG${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'packageId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `PKG${sequence}`;
  }

  /**
   * Get current package ID (without incrementing)
   */
  static async getCurrentPackageId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'packageId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Get next booking ID (returns booking1, booking2, booking3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextBookingId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'bookingId' },
      { $inc: { sequence: 1 } },
      { 
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `booking${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'bookingId' },
      { $inc: { sequence: 1 } },
      { 
        returnDocument: 'after',
        writeConcern: { w: 'majority' }
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `booking${sequence}`;
  }

  /**
   * Get current booking ID (without incrementing)
   */
  static async getCurrentBookingId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const counter = await countersCollection.findOne({ _id: 'bookingId' });
    
    if (!counter) {
      return 0;
    }

    return counter.sequence || 0;
  }

  /**
   * Reset booking counter (admin function)
   */
  static async resetBookingIdCounter(startFrom = 1) {
    const db = getDB();
    const countersCollection = db.collection('counters');

    await countersCollection.updateOne(
      { _id: 'bookingId' },
      { $set: { sequence: startFrom } },
      { upsert: true }
    );

    return startFrom;
  }

  /**
   * Get next card ID (returns CARD1, CARD2, CARD3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextCardId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'cardId' },
      { $inc: { sequence: 1 } },
      {
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `CARD${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'cardId' },
      { $inc: { sequence: 1 } },
      {
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `CARD${sequence}`;
  }

  /**
   * Get next bank details ID (returns BANK1, BANK2, BANK3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextBankDetailsId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'bankDetailsId' },
      { $inc: { sequence: 1 } },
      {
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `BANK${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'bankDetailsId' },
      { $inc: { sequence: 1 } },
      {
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `BANK${sequence}`;
  }

  /**
   * Get next private event join request ID (returns EJR1, EJR2, EJR3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextEventJoinRequestId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'eventJoinRequestId' },
      { $inc: { sequence: 1 } },
      {
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `EJR${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'eventJoinRequestId' },
      { $inc: { sequence: 1 } },
      {
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `EJR${sequence}`;
  }

  /**
   * Get next organiser bank account ID (returns BA1, BA2, BA3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextBankAccountId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'bankAccountId' },
      { $inc: { sequence: 1 } },
      {
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `BA${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'bankAccountId' },
      { $inc: { sequence: 1 } },
      {
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `BA${sequence}`;
  }

  /**
   * Get next event invite ID (returns INV1, INV2, INV3 format)
   * Atomic operation - thread-safe for high traffic
   */
  static async getNextEventInviteId() {
    const db = getDB();
    const countersCollection = db.collection('counters');

    const result = await countersCollection.findOneAndUpdate(
      { _id: 'eventInviteId' },
      { $inc: { sequence: 1 } },
      {
        upsert: true,
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const updatedCounter = result.value || result;
    if (updatedCounter && updatedCounter.sequence) {
      return `INV${updatedCounter.sequence}`;
    }

    const fallbackResult = await countersCollection.findOneAndUpdate(
      { _id: 'eventInviteId' },
      { $inc: { sequence: 1 } },
      {
        returnDocument: 'after',
        writeConcern: { w: 'majority' },
      }
    );

    const fallbackCounter = fallbackResult.value || fallbackResult;
    const sequence = fallbackCounter && fallbackCounter.sequence ? fallbackCounter.sequence : 1;
    return `INV${sequence}`;
  }
}

module.exports = Counter;

