import { bookingRepository } from '../repositories/booking.repository.js';
import { stationRepository } from '../repositories/station.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export class BookingService {
  async createBooking(data, userId, ip) {
    const booking = await bookingRepository.createBookingWithConflictCheck({
      ...data,
      userId,
    });

    // Audit log
    auditRepository.createLog({
      actorId: userId,
      action: 'CREATE_BOOKING',
      collection: 'bookings',
      documentId: booking._id,
      after: booking,
      ip,
    });

    return booking;
  }

  async cancelBooking(id, userId, userRole, ip) {
    const cancelled = await bookingRepository.cancelBooking(id, userId, userRole);

    auditRepository.createLog({
      actorId: userId,
      action: 'CANCEL_BOOKING',
      collection: 'bookings',
      documentId: cancelled._id,
      after: cancelled,
      ip,
    });

    return cancelled;
  }

  async rescheduleBooking(id, payload, userId, userRole, ip) {
    const updated = await bookingRepository.rescheduleBooking(id, {
      userId,
      userRole,
      newStartTime: payload.startTime,
      newEndTime: payload.endTime,
    });

    auditRepository.createLog({
      actorId: userId,
      action: 'RESCHEDULE_BOOKING',
      collection: 'bookings',
      documentId: updated._id,
      after: updated,
      ip,
    });

    return updated;
  }

  async getBookings({ filter = {}, page = 1, limit = 20, userId, userRole }) {
    const effectiveFilter = { ...filter };
    if (userRole === 'driver') {
      effectiveFilter.userId = userId;
    }

    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    return bookingRepository.findBookings({
      filter: effectiveFilter,
      skip,
      limit: Math.max(1, Number(limit)),
    });
  }

  async estimateChargingCost({
    stationId,
    batteryKWh,
    currentSoc,
    targetSoc,
    chargerPowerKW = 60,
  }) {
    if (!stationId) throw new BadRequestError('Station ID is required');
    const station = await stationRepository.findById(stationId);
    if (!station) throw new NotFoundError('Station not found');

    const cur = Math.max(0, Math.min(100, Number(currentSoc)));
    const tgt = Math.max(cur, Math.min(100, Number(targetSoc)));
    const batt = Math.max(1, Number(batteryKWh));
    const power = Math.max(1, Number(chargerPowerKW));

    const energyNeededKWh = Number((((tgt - cur) / 100) * batt).toFixed(2));
    const estimatedCost = Number((energyNeededKWh * station.tariffPerKWh).toFixed(2));
    const durationMinutes = Math.round((energyNeededKWh / power) * 60);

    return {
      stationId: station._id,
      stationName: station.name,
      tariffPerKWh: station.tariffPerKWh,
      energyNeededKWh,
      estimatedCost,
      durationMinutes,
      currentSoc: cur,
      targetSoc: tgt,
    };
  }
}

export const bookingService = new BookingService();
