import { auditRepository } from '../repositories/audit.repository.js';

export function recordAudit({ action, collection, getDocumentId = req => req.params.id }) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const actorId = req.user ? req.user._id : 'anonymous';
        const documentId = typeof getDocumentId === 'function' ? getDocumentId(req) : req.params.id;
        const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

        // Log asynchronously without blocking response
        auditRepository.createLog({
          actorId,
          action,
          collection,
          documentId: documentId || body?.data?._id || body?.data?.id || null,
          before: req._auditBefore || null,
          after: body?.data || null,
          ip,
        });
      }
      return originalJson(body);
    };

    next();
  };
}
