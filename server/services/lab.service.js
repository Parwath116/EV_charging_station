import { LabRepository } from '../repositories/lab.repository.js';

export class LabService {
  /**
   * Run query execution plan analysis
   * MongoDB Operation: .explain("executionStats")
   */
  static async explainQuery(scenario) {
    return LabRepository.runExplain(scenario);
  }

  /**
   * Run side-by-side index performance benchmark
   * MongoDB Operation: IXSCAN vs COLLSCAN
   */
  static async getIndexComparison() {
    return LabRepository.runIndexComparison();
  }

  /**
   * Trigger MongoDB Error 121 ($jsonSchema violation)
   * MongoDB Operation: strict $jsonSchema error capture
   */
  static async testSchemaValidation(type) {
    return LabRepository.runValidationDemo(type);
  }

  /**
   * Demonstrate Multi-Document ACID Transactions
   * MongoDB Operation: session.withTransaction() commit & rollback
   */
  static async testTransaction(shouldAbort) {
    return LabRepository.runTransactionDemo(shouldAbort);
  }

  /**
   * Retrieve database schema, collection sizes, and index inventory
   * MongoDB Operation: db.command({ collStats: ... }), collection.indexes()
   */
  static async getSchemaSummary() {
    return LabRepository.getSchemaSummary();
  }
}
