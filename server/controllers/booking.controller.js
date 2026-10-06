import { bookingService } from '../services/booking.service.js';

export class BookingController {
  async create(req, res, next) {
    try {
      const booking = await bookingService.createBooking(req.body, req.user._id, req.ip);
      res.status(201).json({
        success: true,
        data: booking,
        message: 'Booking confirmed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req, res, next) {
    try {
      const result = await bookingService.getBookings({
        filter: req.query,
        page: req.query.page,
        limit: req.query.limit,
        userId: req.user._id,
        userRole: req.user.role,
      });

      res.status(200).json({
        success: true,
        data: result.bookings,
        pagination: {
          total: result.total,
          page: Number(req.query.page) || 1,
          limit: Number(req.query.limit) || 20,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req, res, next) {
    try {
      const cancelled = await bookingService.cancelBooking(
        req.params.id,
        req.user._id,
        req.user.role,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: cancelled,
        message: 'Booking cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async reschedule(req, res, next) {
    try {
      const updated = await bookingService.rescheduleBooking(
        req.params.id,
        req.body,
        req.user._id,
        req.user.role,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Booking rescheduled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async estimate(req, res, next) {
    try {
      const estimation = await bookingService.estimateChargingCost(req.query);
      res.status(200).json({
        success: true,
        data: estimation,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const bookingController = new BookingController();
