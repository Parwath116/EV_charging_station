import { LabService } from '../services/lab.service.js';

export class LabController {
  static async explain(req, res, next) {
    try {
      const { scenario } = req.body;
      const result = await LabService.explainQuery(scenario || 'geo_near');
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async indexComparison(req, res, next) {
    try {
      const result = await LabService.getIndexComparison();
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async validateDemo(req, res, next) {
    try {
      const { type } = req.body;
      const result = await LabService.testSchemaValidation(type || 'negative_wallet');
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async transactionDemo(req, res, next) {
    try {
      const { abort } = req.body;
      const result = await LabService.testTransaction(Boolean(abort));
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async schemaSummary(req, res, next) {
    try {
      const result = await LabService.getSchemaSummary();
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
