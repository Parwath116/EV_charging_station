import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import { BadRequestError } from '../utils/errors.js';

export class UserRepository {
  get collection() {
    return getDB().collection('users');
  }

  /**
   * Finds a user document by unique email address
   * MongoDB operation: db.collection('users').findOne({ email: lowercaseEmail })
   */
  async findByEmail(email) {
    return this.collection.findOne({ email: email.toLowerCase() });
  }

  /**
   * Finds a user document by ObjectId
   * MongoDB operation: db.collection('users').findOne({ _id: new ObjectId(id) })
   */
  async findById(id) {
    if (!ObjectId.isValid(id)) return null;
    return this.collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Inserts a new user document
   * MongoDB operation: db.collection('users').insertOne(userDoc)
   */
  async create(userDoc) {
    const result = await this.collection.insertOne({
      ...userDoc,
      email: userDoc.email.toLowerCase(),
      createdAt: userDoc.createdAt || new Date(),
    });
    return this.findById(result.insertedId);
  }

  /**
   * Updates user password hash
   * MongoDB operation: db.collection('users').updateOne({ _id }, { $set: { passwordHash } })
   */
  async updatePassword(id, passwordHash) {
    return this.collection.updateOne({ _id: new ObjectId(id) }, { $set: { passwordHash } });
  }

  /**
   * Updates last login timestamp
   * MongoDB operation: db.collection('users').updateOne({ _id }, { $set: { lastLoginAt: new Date() } })
   */
  async updateLastLogin(id) {
    return this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { lastLoginAt: new Date() } }
    );
  }

  /**
   * Adjusts wallet balance using atomic increment/decrement
   * MongoDB operation: db.collection('users').updateOne({ _id }, { $inc: { walletBalance: amount } }, { session })
   */
  async adjustWallet(id, amount, { session } = {}) {
    const options = session ? { session } : {};
    return this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $inc: { walletBalance: amount } },
      options
    );
  }

  /**
   * Appends an EV vehicle to the user's vehicles array
   * MongoDB operation: db.collection('users').updateOne({ _id }, { $push: { vehicles: vehicle } })
   */
  async addVehicle(id, vehicle) {
    return this.collection.updateOne({ _id: new ObjectId(id) }, { $push: { vehicles: vehicle } });
  }

  /**
   * Removes a vehicle from user's vehicles array by model
   * MongoDB operation: db.collection('users').updateOne({ _id }, { $pull: { vehicles: { model } } })
   */
  async removeVehicle(id, model) {
    return this.collection.updateOne({ _id: new ObjectId(id) }, { $pull: { vehicles: { model } } });
  }

  /**
   * Adds a station to user's favourite stations set idempotently
   * MongoDB operation: db.collection('users').updateOne({ _id }, { $addToSet: { favouriteStations: stationId } })
   */
  async addFavouriteStation(id, stationId) {
    return this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $addToSet: { favouriteStations: new ObjectId(stationId) } }
    );
  }

  /**
   * Removes a station from user's favourite stations list
   * MongoDB operation: db.collection('users').updateOne({ _id }, { $pull: { favouriteStations: stationId } })
   */
  async removeFavouriteStation(id, stationId) {
    return this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $pull: { favouriteStations: new ObjectId(stationId) } }
    );
  }

  /**
   * Lists users with pagination and optional role filter
   * MongoDB operation: db.collection('users').find(query).project().skip().limit().toArray()
   */
  async findUsers({ filter = {}, skip = 0, limit = 50 } = {}) {
    const query = {};
    if (filter.role) query.role = filter.role;
    if (filter.search) {
      query.$or = [
        { name: { $regex: filter.search, $options: 'i' } },
        { email: { $regex: filter.search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.collection
        .find(query, { projection: { passwordHash: 0 } })
        .sort({ createdAt: -1 })
        .skip(Number(skip) || 0)
        .limit(Number(limit) || 50)
        .toArray(),
      this.collection.countDocuments(query),
    ]);

    return { users, total };
  }

  /**
   * Updates user profile fields
   * MongoDB operation: db.collection('users').updateOne({ _id }, { $set: updateDoc })
   */
  async updateProfile(id, updateDoc) {
    return this.collection.updateOne({ _id: new ObjectId(id) }, { $set: updateDoc });
  }

  /**
   * Unsets a specific field from a user document (demonstrating explicit $unset)
   * Hardcoded whitelist restricts unsetting to non-sensitive fields only.
   */
  async unsetField(id, fieldName) {
    const ALLOWED_UNSET_FIELDS = new Set([
      'phoneNumber',
      'notes',
      'preferredLanguage',
      'avatarUrl',
      'notificationPreferences',
      'tempNote',
    ]);
    const SENSITIVE_FIELDS = new Set(['role', 'passwordHash', 'walletBalance', 'email', '_id']);

    if (SENSITIVE_FIELDS.has(fieldName) || !ALLOWED_UNSET_FIELDS.has(fieldName)) {
      throw new BadRequestError(
        `Field "${fieldName}" cannot be unset. Only non-sensitive whitelisted fields may be unset.`
      );
    }

    return this.collection.updateOne({ _id: new ObjectId(id) }, { $unset: { [fieldName]: '' } });
  }

  /**
   * Upserts user preferences or settings (demonstrating explicit upsert: true)
   * MongoDB operation: db.collection('user_settings').updateOne({ userId }, { $set: settingsDoc }, { upsert: true })
   */
  async upsertUserSettings(userId, settingsDoc) {
    return getDB()
      .collection('user_settings')
      .updateOne(
        { userId: new ObjectId(userId) },
        {
          $set: {
            ...settingsDoc,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
  }

  /**
   * Renames a field across users collection (demonstrating explicit $rename)
   * Hardcoded whitelist restricts renaming to non-sensitive fields only.
   */
  async renameField(oldField, newField) {
    const ALLOWED_RENAME_FIELDS = new Set([
      'phoneNumber',
      'phone',
      'notes',
      'userNotes',
      'preferredLanguage',
      'locale',
      'tempNote',
      'archiveNote',
    ]);
    const SENSITIVE_FIELDS = new Set(['role', 'passwordHash', 'walletBalance', 'email', '_id']);

    if (
      SENSITIVE_FIELDS.has(oldField) ||
      SENSITIVE_FIELDS.has(newField) ||
      !ALLOWED_RENAME_FIELDS.has(oldField) ||
      !ALLOWED_RENAME_FIELDS.has(newField)
    ) {
      throw new BadRequestError(
        `Field renaming between "${oldField}" and "${newField}" is forbidden. Sensitive and non-whitelisted fields cannot be renamed.`
      );
    }

    return this.collection.updateMany({}, { $rename: { [oldField]: newField } });
  }
}

export const userRepository = new UserRepository();
