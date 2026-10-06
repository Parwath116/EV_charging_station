import { logger } from '../utils/logger.js';

export class SSEService {
  static clients = new Set();
  static heartbeatInterval = null;
  static stationChangeStream = null;
  static alertChangeStream = null;

  /**
   * Register a new client for SSE event streaming.
   */
  static addClient(res, req) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send initial handshake
    res.write('event: handshake\ndata: {"status":"connected"}\n\n');

    this.clients.add(res);
    logger.debug(`SSE client connected. Active clients: ${this.clients.size}`);

    req.on('close', () => {
      this.removeClient(res);
    });

    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }
  }

  /**
   * Remove client on disconnection.
   */
  static removeClient(res) {
    this.clients.delete(res);
    logger.debug(`SSE client disconnected. Remaining clients: ${this.clients.size}`);

    if (this.clients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Heartbeat to prevent socket timeouts across reverse proxies.
   */
  static startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        try {
          client.write(': heartbeat\n\n');
        } catch {
          this.removeClient(client);
        }
      }
    }, 15000);
    // Unref so heartbeat doesn't prevent graceful node process exit
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Broadcast an event and payload to all connected SSE clients.
   */
  static broadcast(eventName, data) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (err) {
        logger.warn(`Failed to write to SSE client: ${err.message}`);
        this.removeClient(client);
      }
    }
  }

  /**
   * Initialize MongoDB Change Streams for real-time reactive event delivery.
   * MongoDB Features: collection.watch()
   */
  static async initChangeStreams(db) {
    try {
      // 1. Watch stations for hardware status transitions
      this.stationChangeStream = db.collection('stations').watch(
        [
          {
            $match: {
              operationType: { $in: ['update', 'replace'] },
            },
          },
        ],
        { fullDocument: 'updateLookup' }
      );

      this.stationChangeStream.on('change', change => {
        const doc = change.fullDocument;
        if (doc) {
          this.broadcast('station_updated', {
            stationId: doc._id,
            name: doc.name,
            status: doc.status,
            chargers: (doc.chargers || []).map(c => ({
              chargerId: c.chargerId,
              status: c.status,
              powerKW: c.powerKW,
            })),
          });
        }
      });

      this.stationChangeStream.on('error', err => {
        logger.warn(`Station ChangeStream warning: ${err.message}`);
      });

      // 2. Watch alerts collection for newly recorded anomalies
      this.alertChangeStream = db.collection('alerts').watch([
        {
          $match: {
            operationType: 'insert',
          },
        },
      ]);

      this.alertChangeStream.on('change', change => {
        const doc = change.fullDocument;
        if (doc) {
          this.broadcast('alert', doc);
        }
      });

      this.alertChangeStream.on('error', err => {
        logger.warn(`Alert ChangeStream warning: ${err.message}`);
      });

      logger.info('MongoDB Change Streams initialized for stations and alerts.');
    } catch (err) {
      logger.warn(
        `MongoDB Change Streams unavailable (requires replica set): ${err.message}. Real-time will use in-app broadcasts.`
      );
    }
  }

  /**
   * Close change streams and active connections.
   */
  static async close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.stationChangeStream) {
      try {
        await this.stationChangeStream.close();
      } catch {
        // ignore on teardown
      }
      this.stationChangeStream = null;
    }

    if (this.alertChangeStream) {
      try {
        await this.alertChangeStream.close();
      } catch {
        // ignore on teardown
      }
      this.alertChangeStream = null;
    }

    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}
