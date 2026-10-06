import { userRepository } from '../repositories/user.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export class UserController {
  async getProfile(req, res, next) {
    try {
      const user = await userRepository.findById(req.user._id);
      if (!user) throw new NotFoundError('User not found');
      const { passwordHash: _, ...safeUser } = user;
      res.status(200).json({ success: true, data: safeUser });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const { name } = req.body;
      if (!name || name.trim().length < 2) {
        throw new BadRequestError('Name must be at least 2 characters');
      }

      await userRepository.updateProfile(req.user._id, { name: name.trim() });
      const updated = await userRepository.findById(req.user._id);
      const { passwordHash: _, ...safeUser } = updated;

      res.status(200).json({
        success: true,
        data: safeUser,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async addVehicle(req, res, next) {
    try {
      const { make, model, connectorType, batteryKWh } = req.body;
      if (!make || !model || !connectorType || !batteryKWh) {
        throw new BadRequestError('make, model, connectorType, and batteryKWh are required');
      }

      await userRepository.addVehicle(req.user._id, {
        make,
        model,
        connectorType,
        batteryKWh: Number(batteryKWh),
      });

      const updated = await userRepository.findById(req.user._id);
      res.status(200).json({
        success: true,
        data: updated.vehicles,
        message: 'Vehicle added successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async removeVehicle(req, res, next) {
    try {
      const { model } = req.params;
      await userRepository.removeVehicle(req.user._id, decodeURIComponent(model));
      const updated = await userRepository.findById(req.user._id);
      res.status(200).json({
        success: true,
        data: updated.vehicles,
        message: 'Vehicle removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async topUpWallet(req, res, next) {
    try {
      const amount = Number(req.body.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new BadRequestError('Top-up amount must be a positive number');
      }

      await userRepository.adjustWallet(req.user._id, amount);
      const updated = await userRepository.findById(req.user._id);

      auditRepository.createLog({
        actorId: req.user._id,
        action: 'WALLET_TOPUP',
        collection: 'users',
        documentId: req.user._id,
        after: { walletBalance: updated.walletBalance, amountAdded: amount },
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        data: { walletBalance: updated.walletBalance },
        message: `Wallet topped up by ₹${amount.toFixed(2)} successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  async addFavourite(req, res, next) {
    try {
      await userRepository.addFavouriteStation(req.user._id, req.params.stationId);
      res.status(200).json({
        success: true,
        message: 'Station added to favourites',
      });
    } catch (error) {
      next(error);
    }
  }

  async removeFavourite(req, res, next) {
    try {
      await userRepository.removeFavouriteStation(req.user._id, req.params.stationId);
      res.status(200).json({
        success: true,
        message: 'Station removed from favourites',
      });
    } catch (error) {
      next(error);
    }
  }

  async listUsers(req, res, next) {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const result = await userRepository.findUsers({
        filter: req.query,
        skip,
        limit,
      });
      res.status(200).json({
        success: true,
        data: result.users,
        pagination: {
          total: result.total,
          page,
          limit,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async unsetField(req, res, next) {
    try {
      const { id, field } = req.body;
      const targetId = id || req.params.id;
      if (!targetId || !field) {
        throw new BadRequestError('User id and field name are required');
      }

      const before = await userRepository.findById(targetId);
      if (!before) throw new NotFoundError('User not found');

      await userRepository.unsetField(targetId, field);
      const after = await userRepository.findById(targetId);

      auditRepository.createLog({
        actorId: req.user._id,
        action: 'UNSET_USER_FIELD',
        collection: 'users',
        documentId: targetId,
        before: { [field]: before[field] },
        after: { [field]: after[field] },
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        message: `Field "${field}" successfully unset for user`,
      });
    } catch (error) {
      next(error);
    }
  }

  async renameField(req, res, next) {
    try {
      const { oldField, newField } = req.body;
      if (!oldField || !newField) {
        throw new BadRequestError('oldField and newField are required');
      }

      await userRepository.renameField(oldField, newField);

      auditRepository.createLog({
        actorId: req.user._id,
        action: 'RENAME_USER_FIELD',
        collection: 'users',
        documentId: 'bulk_collection',
        before: { fieldName: oldField },
        after: { fieldName: newField },
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        message: `Field "${oldField}" successfully renamed to "${newField}" across users`,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAuditLogs(req, res, next) {
    try {
      const { collection, action, limit, skip } = req.query;
      const filter = {};
      if (collection) filter.collection = collection;
      if (action) filter.action = action;

      const result = await auditRepository.findLogs({
        filter,
        limit: limit ? parseInt(limit, 10) : 50,
        skip: skip ? parseInt(skip, 10) : 0,
      });

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          limit: limit ? parseInt(limit, 10) : 50,
          skip: skip ? parseInt(skip, 10) : 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
