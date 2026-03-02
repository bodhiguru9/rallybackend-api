const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const Counter = require('./Counter');

/**
 * OrganiserBankAccount Model
 * Simple bank account details for organisers: Account holder name, IBAN, Bank name.
 * An organiser can have multiple bank accounts.
 * Each record has its own sequential id: bankAccountId (BA1, BA2, ...).
 * Collection: organiserBankAccounts
 */
class OrganiserBankAccount {
  constructor(data) {
    this.bankAccountId = data.bankAccountId; // Sequential ID (BA1, BA2, ...)
    this.organizerId = data.organizerId; // MongoDB ObjectId of the organiser user
    this.accountHolderName = data.accountHolderName || '';
    this.iban = data.iban || '';
    this.bankName = data.bankName || '';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Create a new bank account for an organiser (generates own sequential id: BA1, BA2, ...)
   * @param {string|ObjectId} organizerId - MongoDB _id of the organiser
   * @param {{ accountHolderName: string, iban: string, bankName: string }} data
   */
  static async create(organizerId, data) {
    const db = getDB();
    const col = db.collection('organiserBankAccounts');

    const organizerIdObj = typeof organizerId === 'string' ? new ObjectId(organizerId) : organizerId;
    const accountHolderName = (data.accountHolderName || '').trim();
    const iban = (data.iban || '').trim();
    const bankName = (data.bankName || '').trim();

    if (!accountHolderName) throw new Error('Account holder name is required');
    if (!iban) throw new Error('IBAN is required');
    if (!bankName) throw new Error('Bank name is required');

    const bankAccountId = await Counter.getNextBankAccountId();

    const doc = {
      bankAccountId,
      organizerId: organizerIdObj,
      accountHolderName,
      iban,
      bankName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await col.insertOne(doc);
    return await col.findOne({ _id: result.insertedId });
  }

  /**
   * Get all bank accounts for an organiser
   * @param {string|ObjectId} organizerId - MongoDB _id of the organiser
   */
  static async findByOrganizerId(organizerId) {
    const db = getDB();
    const col = db.collection('organiserBankAccounts');
    const organizerIdObj = typeof organizerId === 'string' ? new ObjectId(organizerId) : organizerId;
    return await col.find({ organizerId: organizerIdObj }).sort({ createdAt: -1 }).toArray();
  }

  /**
   * Get one bank account by id (MongoDB _id or sequential bankAccountId e.g. BA1); returns null if not found or not belonging to organiser
   */
  static async findById(id, organizerId) {
    const db = getDB();
    const col = db.collection('organiserBankAccounts');
    const organizerIdObj = typeof organizerId === 'string' ? new ObjectId(organizerId) : organizerId;
    const idStr = String(id).trim();
    // Try as MongoDB ObjectId first
    try {
      const _id = typeof id === 'string' ? new ObjectId(id) : id;
      const doc = await col.findOne({ _id, organizerId: organizerIdObj });
      if (doc) return doc;
    } catch {
      // not a valid ObjectId
    }
    // Try as sequential bankAccountId (e.g. BA1, BA2)
    return await col.findOne({ bankAccountId: idStr, organizerId: organizerIdObj });
  }

  /**
   * Update a bank account by id (_id or bankAccountId); only if it belongs to the organiser
   */
  static async updateById(id, organizerId, data) {
    const db = getDB();
    const col = db.collection('organiserBankAccounts');
    const organizerIdObj = typeof organizerId === 'string' ? new ObjectId(organizerId) : organizerId;

    const existing = await OrganiserBankAccount.findById(id, organizerId);
    if (!existing) return null;

    const update = { updatedAt: new Date() };
    if (data.accountHolderName !== undefined) update.accountHolderName = String(data.accountHolderName).trim();
    if (data.iban !== undefined) update.iban = String(data.iban).trim();
    if (data.bankName !== undefined) update.bankName = String(data.bankName).trim();

    const result = await col.findOneAndUpdate(
      { _id: existing._id },
      { $set: update },
      { returnDocument: 'after' }
    );
    return result || null;
  }

  /**
   * Delete a bank account by id (_id or bankAccountId); only if it belongs to the organiser
   */
  static async deleteById(id, organizerId) {
    const db = getDB();
    const col = db.collection('organiserBankAccounts');

    const existing = await OrganiserBankAccount.findById(id, organizerId);
    if (!existing) return false;

    const result = await col.deleteOne({ _id: existing._id });
    return result.deletedCount > 0;
  }
}

module.exports = OrganiserBankAccount;
