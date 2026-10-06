import { getDB } from '../config/db.js';
import { logger } from '../utils/logger.js';

export class AuditRepository {
  static async log(data) {
    return auditRepository.createLog(data);
  }

  static async findLogs(options) {
    return auditRepository.findLogs(options);
  }

  /**
   * Records an audit log entry in MongoDB
   * MongoDB operation: db.collection('audit_logs').insertOne()
   */
  async createLog({
    actorId,
    action,
    collection,
    documentId,
    before = null,
    after = null,
    ip = '127.0.0.1',
  }) {
    try {
      const db = getDB();
      const doc = {
        actorId: actorId ? String(actorId) : 'system',
        action,
        collection,
        documentId: documentId ? String(documentId) : null,
        before,
        after,
        ip,
        ts: new Date(),
      };
      await db.collection('audit_logs').insertOne(doc);
    } catch (error) {
      logger.error('Failed to create audit log entry:', error.message);
    }
  }

  /**
   * Retrieves paginated audit logs
   * MongoDB operation: db.collection('audit_logs').find().sort().skip().limit()
   */
  async findLogs({ filter = {}, limit = 50, skip = 0 }) {
    const db = getDB();
    const query = {};
    if (filter.collection) query.collection = filter.collection;
    if (filter.actorId) query.actorId = filter.actorId;
    if (filter.action) query.action = filter.action;

    const [items, total] = await Promise.all([
      db.collection('audit_logs').find(query).sort({ ts: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('audit_logs').countDocuments(query),
    ]);

    return { items, total };
  }
}

export const auditRepository = new AuditRepository();
