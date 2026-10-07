import { connectDB, closeDB, getDb } from '../config/db.js';
import { TelemetryRepository } from '../repositories/telemetry.repository.js';
import { AlertService } from '../services/alert.service.js';
import { StationRepository } from '../repositories/station.repository.js';
import { SSEService } from '../services/sse.service.js';
import { logger } from '../utils/logger.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const once = args.includes('--once');
const showHelp = args.includes('--help') || args.includes('-h');
const cyclesArg = args.find(a => a.startsWith('--cycles='));
const intervalArg = args.find(a => a.startsWith('--interval='));
const faultsArg = args.find(a => a.startsWith('--faults='));
const maxCycles = cyclesArg ? parseInt(cyclesArg.split('=')[1], 10) : once ? 1 : Infinity;
const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 4000;
const defaultFaultProb = faultsArg ? parseFloat(faultsArg.split('=')[1]) : 0.02;

if (showHelp) {
  console.log(`
VoltGrid IoT Hardware Telemetry & Grid Simulator
Usage:
  node server/scripts/simulator.js [options]

Options:
  --once            Run exactly 1 simulation cycle and exit
  --cycles=N        Run N simulation cycles and exit (default: continuous)
  --interval=MS     Interval between cycles in milliseconds (default: 4000)
  --faults=PROB     Probability of anomaly per dispenser (default: 0.02 = 2%)
  --help, -h        Show this help message
  `);
  process.exit(0);
}

function getRandomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

export async function runSimulationCycle(db, injectFaultProbability = defaultFaultProb) {
  const stations = await db
    .collection('stations')
    .find({ status: 'active' }, { projection: { _id: 1, name: 1, chargers: 1 } })
    .toArray();

  if (!stations || stations.length === 0) {
    logger.warn('No active stations found to simulate telemetry.');
    return { readingsCount: 0, anomaliesCount: 0, recoveredCount: 0 };
  }

  const readings = [];
  const anomalies = [];
  let recoveredCount = 0;

  for (const station of stations) {
    for (const charger of station.chargers || []) {
      const now = new Date();
      let powerKW = 0;
      let voltage = Math.round(getRandomInRange(225, 235) * 10) / 10;
      let temperatureC = Math.round(getRandomInRange(32, 46) * 10) / 10;
      let socPct = Math.round(getRandomInRange(20, 85));
      let currentA = 0;
      let faultCode = null;

      // Simulated field maintenance recovery for previously faulted chargers
      if (charger.status === 'faulted') {
        // 25% chance per cycle that technician reset recovers the dispenser
        if (Math.random() < 0.25) {
          try {
            await StationRepository.updateChargerStatus(
              station._id,
              charger.chargerId,
              'available'
            );
            charger.status = 'available';
            recoveredCount += 1;
            SSEService.broadcast('station_updated', {
              stationId: station._id,
              chargers: [{ chargerId: charger.chargerId, status: 'available' }],
            });
          } catch {
            // ignore recovery error
          }
        }
      }

      // Active charging telemetry
      if (charger.status === 'charging') {
        powerKW = Math.round(getRandomInRange(charger.powerKW * 0.5, charger.powerKW) * 10) / 10;
        currentA = Math.round((powerKW / (voltage / 1000)) * 10) / 10;
        temperatureC = Math.round(getRandomInRange(42, 58) * 10) / 10;
      }

      // Check for simulated anomaly injection (only on non-faulted chargers)
      const shouldInjectFault =
        charger.status !== 'faulted' && Math.random() < injectFaultProbability;
      if (shouldInjectFault) {
        const faultRoll = Math.random();
        if (faultRoll < 0.35) {
          // Overtemperature anomaly (thermal threshold trigger)
          temperatureC = Math.round(getRandomInRange(76, 85) * 10) / 10;
        } else if (faultRoll < 0.65) {
          // Overvoltage or sag
          voltage =
            Math.random() > 0.5
              ? Math.round(getRandomInRange(265, 275))
              : Math.round(getRandomInRange(165, 185));
        } else {
          // Hardware safety fault code
          faultCode = 'ERR_PILOT_LOCKOUT_07';
        }
      }

      const telemetryDoc = {
        ts: now,
        meta: {
          stationId: station._id,
          chargerId: charger.chargerId,
        },
        powerKW,
        voltage,
        currentA,
        temperatureC,
        socPct,
        chargerStatus: charger.status,
      };

      readings.push(telemetryDoc);

      // Evaluate anomaly
      if (shouldInjectFault) {
        anomalies.push({
          stationId: station._id,
          chargerId: charger.chargerId,
          powerKW,
          voltage,
          currentA,
          temperatureC,
          faultCode,
        });
      }
    }
  }

  // 1. Bulk insert to time-series collection
  if (readings.length > 0) {
    await TelemetryRepository.insertMany(readings);
  }

  // 2. Trigger alerts for detected anomalies
  for (const anomaly of anomalies) {
    await AlertService.evaluateTelemetry(anomaly);
  }

  return {
    readingsCount: readings.length,
    anomaliesCount: anomalies.length,
    recoveredCount,
  };
}

async function main() {
  await connectDB();
  const db = getDb();

  logger.info('===========================================================');
  logger.info(' VoltGrid IoT Hardware Telemetry & Grid Simulator');
  logger.info(
    ` Target: ${db.databaseName} | Interval: ${intervalMs}ms | Anomaly Rate: ${defaultFaultProb * 100}% | Cycles: ${maxCycles}`
  );
  logger.info(' Press Ctrl+C to terminate simulator gracefully.');
  logger.info('===========================================================');

  let cycle = 0;

  const intervalId = setInterval(async () => {
    cycle += 1;
    try {
      const { readingsCount, anomaliesCount, recoveredCount } = await runSimulationCycle(
        db,
        defaultFaultProb
      );
      logger.info(
        `[Cycle #${cycle}] Readings ingested: ${readingsCount} | Anomalies: ${anomaliesCount} | Recoveries: ${recoveredCount}`
      );

      if (cycle >= maxCycles) {
        clearInterval(intervalId);
        logger.info('Simulation cycle limit reached. Shutting down gracefully.');
        await closeDB();
        process.exit(0);
      }
    } catch (err) {
      logger.error(`Simulation cycle error: ${err.message}`);
    }
  }, intervalMs);

  process.on('SIGINT', async () => {
    clearInterval(intervalId);
    logger.info('Simulator interrupted. Closing database connections...');
    await closeDB();
    process.exit(0);
  });
}

// Run if called directly
if (
  process.argv[1] &&
  (process.argv[1].endsWith('simulator.js') || process.argv[1].includes('simulator'))
) {
  main().catch(err => {
    logger.error('Fatal simulator error:', err);
    process.exit(1);
  });
}
