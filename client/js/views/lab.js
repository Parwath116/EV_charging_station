/**
 * VoltGrid Database Lab View (Admin-Only DBA & Performance Engineering Tool)
 * Provides interactive query execution analysis via explain("executionStats"),
 * index benchmarks (IXSCAN vs COLLSCAN), Error 121 schema validation sandbox,
 * multi-document ACID transaction demonstrator, and storage/collection visualizer.
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';

export class LabView {
  constructor() {
    this.activeTab = 'explain';
  }

  async render(container) {
    if (!state.user || state.user.role !== 'admin') {
      container.innerHTML = `
        <div class="container" style="padding: 4rem 1rem; text-align: center; max-width: 600px;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
          <h2 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem;">Admin Access Required</h2>
          <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
            The Database Lab provides direct database execution analysis, performance benchmarking, and schema diagnostics. This tool is restricted to system administrators.
          </p>
          <a href="#/login" class="btn btn-primary">Sign In as Admin</a>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="lab-view-wrapper container" style="padding-top: var(--space-lg); padding-bottom: var(--space-2xl);">
        <!-- Header -->
        <div style="margin-bottom: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
            <span style="font-size: 1.5rem;">🔬</span>
            <h1 style="font-size: 1.85rem; font-weight: 700; margin: 0;">Database Lab & Query Diagnostics</h1>
          </div>
          <p style="color: var(--text-secondary); font-size: 0.92rem;">
            Inspect MongoDB 7+ execution engines, verify index selectivity (IXSCAN vs COLLSCAN), test strict schema enforcement, and visualize cluster topology.
          </p>
        </div>

        <!-- Navigation Tabs -->
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
          <button class="btn btn-sm btn-tab ${this.activeTab === 'explain' ? 'btn-primary' : 'btn-secondary'}" data-tab="explain">
            ⚡ Explain & ExecutionStats
          </button>
          <button class="btn btn-sm btn-tab ${this.activeTab === 'benchmark' ? 'btn-primary' : 'btn-secondary'}" data-tab="benchmark">
            📊 Index Benchmark (IXSCAN vs COLLSCAN)
          </button>
          <button class="btn btn-sm btn-tab ${this.activeTab === 'validation' ? 'btn-primary' : 'btn-secondary'}" data-tab="validation">
            🛡️ Schema Validation (Error 121)
          </button>
          <button class="btn btn-sm btn-tab ${this.activeTab === 'transactions' ? 'btn-primary' : 'btn-secondary'}" data-tab="transactions">
            🔄 ACID Transactions Demo
          </button>
          <button class="btn btn-sm btn-tab ${this.activeTab === 'datamodel' ? 'btn-primary' : 'btn-secondary'}" data-tab="datamodel">
            🗄️ Data Model & Storage
          </button>
        </div>

        <!-- Tab Content Slots -->
        <div id="lab-tab-content">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    this.bindEvents(container);
    this.renderCurrentTab();
  }

  bindEvents(container) {
    container.querySelectorAll('.btn-tab').forEach(btn => {
      btn.addEventListener('click', e => {
        container.querySelectorAll('.btn-tab').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        e.currentTarget.classList.remove('btn-secondary');
        e.currentTarget.classList.add('btn-primary');
        this.activeTab = e.currentTarget.getAttribute('data-tab');
        this.renderCurrentTab();
      });
    });
  }

  renderCurrentTab() {
    const slot = document.getElementById('lab-tab-content');
    if (!slot) return;

    if (this.activeTab === 'explain') this.renderExplainTab(slot);
    else if (this.activeTab === 'benchmark') this.renderBenchmarkTab(slot);
    else if (this.activeTab === 'validation') this.renderValidationTab(slot);
    else if (this.activeTab === 'transactions') this.renderTransactionsTab(slot);
    else if (this.activeTab === 'datamodel') this.renderDataModelTab(slot);
  }

  // ================= TAB 1: EXPLAIN & EXECUTION STATS =================
  renderExplainTab(slot) {
    slot.innerHTML = `
      <div class="card" style="padding: 1.5rem; margin-bottom: 1.5rem;">
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">Explain Plan Evaluator</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
          Executes <code style="color: var(--accent-primary);">.explain("executionStats")</code> against live collections to analyze optimizer decisions, stage pipelines, and document retrieval efficiency.
        </p>

        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 1.25rem;">
          <label for="explain-scenario" style="font-size: 0.85rem; font-weight: 600;">Workload Pipeline:</label>
          <select id="explain-scenario" class="input" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; min-width: 320px;">
            <option value="geo_near">Geospatial Discovery ($near 2dsphere on stations)</option>
            <option value="peak_hour_agg">Diurnal Peak-Hour Aggregation ($project, $hour, $group)</option>
            <option value="text_search">Full-Text Search ($text on stations catalog)</option>
            <option value="partial_index_bookings">Active Slot Filter (Partial Index on bookings)</option>
            <option value="telemetry_timeseries">Time-Series Range Query (telemetry compound index)</option>
          </select>
          <button id="btn-run-explain" class="btn btn-primary btn-sm" type="button">Run Explain</button>
        </div>

        <div id="explain-results" style="display: none;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
            <div class="metric-card" style="padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Winning Stage</div>
              <div id="stat-stage" style="font-size: 1.25rem; font-weight: 700; color: var(--accent-primary);">-</div>
            </div>
            <div class="metric-card" style="padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Execution Time</div>
              <div id="stat-time" style="font-size: 1.25rem; font-weight: 700; color: var(--text-main);">-</div>
            </div>
            <div class="metric-card" style="padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Docs Examined</div>
              <div id="stat-docs" style="font-size: 1.25rem; font-weight: 700; color: var(--text-main);">-</div>
            </div>
            <div class="metric-card" style="padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Keys Examined</div>
              <div id="stat-keys" style="font-size: 1.25rem; font-weight: 700; color: var(--text-main);">-</div>
            </div>
            <div class="metric-card" style="padding: 1rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Docs Returned</div>
              <div id="stat-returned" style="font-size: 1.25rem; font-weight: 700; color: var(--text-main);">-</div>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Query Definition:</div>
            <pre id="stat-query" style="background: var(--bg-card); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.8rem; overflow-x: auto; color: var(--accent-primary);"></pre>
          </div>

          <div>
            <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">ExecutionStats Raw JSON:</div>
            <pre id="stat-raw" style="background: var(--bg-card); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.75rem; max-height: 320px; overflow-y: auto; color: var(--text-secondary);"></pre>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-run-explain')?.addEventListener('click', async () => {
      const scenario = document.getElementById('explain-scenario').value;
      const resultsDiv = document.getElementById('explain-results');
      try {
        const res = await api.post('/lab/explain', { scenario });
        const data = res.data;
        const stats = data.executionStats || {};

        document.getElementById('stat-stage').textContent =
          stats.executionStages?.stage || stats.stage || 'IXSCAN';
        document.getElementById('stat-time').textContent = `${stats.executionTimeMillis ?? 0} ms`;
        document.getElementById('stat-docs').textContent = stats.totalDocsExamined ?? 0;
        document.getElementById('stat-keys').textContent = stats.totalKeysExamined ?? 0;
        document.getElementById('stat-returned').textContent = stats.nReturned ?? 0;
        document.getElementById('stat-query').textContent = data.query;
        document.getElementById('stat-raw').textContent = JSON.stringify(stats, null, 2);

        resultsDiv.style.display = 'block';
      } catch (err) {
        toast.error('Explain failed: ' + err.message);
      }
    });
  }

  // ================= TAB 2: BENCHMARK (IXSCAN vs COLLSCAN) =================
  renderBenchmarkTab(slot) {
    slot.innerHTML = `
      <div class="card" style="padding: 1.5rem; margin-bottom: 1.5rem;">
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">Index Scan vs Full Table Scan Benchmark</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          Executes identical filter criteria <code style="color: var(--accent-primary);">{ status: "active", tariffPerKWh: { $lte: 25 } }</code> with index hint vs <code style="color: var(--status-faulted);">{ $natural: 1 }</code> table scan.
        </p>

        <button id="btn-run-benchmark" class="btn btn-primary btn-sm" type="button" style="margin-bottom: 1.5rem;">
          Run Benchmark Comparison
        </button>

        <div id="benchmark-results" style="display: none;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem;">
            <!-- Indexed Box -->
            <div style="background: rgba(34, 197, 94, 0.08); border: 1px solid var(--status-available); border-radius: var(--radius-sm); padding: 1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <h4 style="color: var(--status-available); font-weight: 700; margin: 0;">Indexed Query (IXSCAN)</h4>
                <span class="badge badge-success">Optimized</span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;" id="bm-idx-name">Index: idx_stations_active_tariff_partial</p>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.4rem;">
                <li><strong>Execution Time:</strong> <span id="bm-idx-time">0 ms</span></li>
                <li><strong>Documents Examined:</strong> <span id="bm-idx-docs">0</span></li>
                <li><strong>Index Keys Examined:</strong> <span id="bm-idx-keys">0</span></li>
                <li><strong>Documents Returned:</strong> <span id="bm-idx-returned">0</span></li>
              </ul>
            </div>

            <!-- Unindexed Box -->
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid var(--status-faulted); border-radius: var(--radius-sm); padding: 1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <h4 style="color: var(--status-faulted); font-weight: 700; margin: 0;">Collection Scan (COLLSCAN)</h4>
                <span class="badge badge-danger">Unindexed</span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">Forced { $natural: 1 } scan</p>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.4rem;">
                <li><strong>Execution Time:</strong> <span id="bm-unidx-time">0 ms</span></li>
                <li><strong>Documents Examined:</strong> <span id="bm-unidx-docs">0</span></li>
                <li><strong>Index Keys Examined:</strong> <span id="bm-unidx-keys">0</span></li>
                <li><strong>Documents Returned:</strong> <span id="bm-unidx-returned">0</span></li>
              </ul>
            </div>
          </div>

          <div class="card" style="padding: 1rem; background: var(--bg-surface); border-left: 4px solid var(--accent-primary);">
            <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 0.25rem;">DBA Analysis & Efficiency Verdict</div>
            <p id="bm-analysis-text" style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;"></p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-run-benchmark')?.addEventListener('click', async () => {
      try {
        const res = await api.get('/lab/index-comparison');
        const data = res.data;

        document.getElementById('bm-idx-time').textContent =
          `${data.indexedRun.executionTimeMillis} ms`;
        document.getElementById('bm-idx-docs').textContent = data.indexedRun.totalDocsExamined;
        document.getElementById('bm-idx-keys').textContent = data.indexedRun.totalKeysExamined;
        document.getElementById('bm-idx-returned').textContent = data.indexedRun.nReturned;

        document.getElementById('bm-unidx-time').textContent =
          `${data.unindexedRun.executionTimeMillis} ms`;
        document.getElementById('bm-unidx-docs').textContent = data.unindexedRun.totalDocsExamined;
        document.getElementById('bm-unidx-keys').textContent = data.unindexedRun.totalKeysExamined;
        document.getElementById('bm-unidx-returned').textContent = data.unindexedRun.nReturned;

        document.getElementById('bm-analysis-text').textContent =
          `Index scan reduced document inspection by ${data.analysis.docReductionPercentage} (${data.analysis.docsExaminedSaved} fewer docs scanned). ${data.analysis.verdict}`;

        document.getElementById('benchmark-results').style.display = 'block';
      } catch (err) {
        toast.error('Benchmark failed: ' + err.message);
      }
    });
  }

  // ================= TAB 3: SCHEMA VALIDATION (ERROR 121) =================
  renderValidationTab(slot) {
    slot.innerHTML = `
      <div class="card" style="padding: 1.5rem; margin-bottom: 1.5rem;">
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">Server-Side $jsonSchema Validation Sandbox</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          MongoDB validates document structure, types, ranges, and geospatial coordinates inside the database engine (<code style="color: var(--accent-primary);">validationLevel: "strict", validationAction: "error"</code>). Test live rejection triggers:
        </p>

        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem;">
          <button class="btn btn-secondary btn-sm btn-val-trigger" data-type="negative_wallet">
            ❌ Trigger Negative Wallet (balance: -1500)
          </button>
          <button class="btn btn-secondary btn-sm btn-val-trigger" data-type="out_of_bounds_gps">
            ❌ Trigger Out-of-Bounds GPS ([100.5, 50.2])
          </button>
          <button class="btn btn-secondary btn-sm btn-val-trigger" data-type="invalid_connector">
            ❌ Trigger Invalid Connector Enum
          </button>
        </div>

        <div id="val-demo-results" style="display: none;">
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid var(--status-faulted); border-radius: var(--radius-sm); padding: 1.25rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div style="font-weight: 700; color: var(--status-faulted); font-size: 1rem;">
                🚨 MongoDB Error 121: DocumentValidationFailure
              </div>
              <span class="badge badge-danger">Write Rejected</span>
            </div>
            <p id="val-error-message" style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 0.75rem;"></p>
            <pre id="val-error-json" style="background: var(--bg-card); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--status-faulted); overflow-x: auto;"></pre>
          </div>
        </div>
      </div>
    `;

    slot.querySelectorAll('.btn-val-trigger').forEach(btn => {
      btn.addEventListener('click', async e => {
        const type = e.currentTarget.getAttribute('data-type');
        try {
          const res = await api.post('/lab/validate-demo', { type });
          const data = res.data;
          document.getElementById('val-error-message').textContent =
            data.message || 'Write was rejected by database engine.';
          document.getElementById('val-error-json').textContent = JSON.stringify(data, null, 2);
          document.getElementById('val-demo-results').style.display = 'block';
          toast.success('Validation failure captured successfully!');
        } catch (err) {
          toast.error('Request failed: ' + err.message);
        }
      });
    });
  }

  // ================= TAB 4: ACID TRANSACTIONS DEMO =================
  renderTransactionsTab(slot) {
    slot.innerHTML = `
      <div class="card" style="padding: 1.5rem; margin-bottom: 1.5rem;">
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">Multi-Document ACID Transactions (Replica Set rs0)</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          VoltGrid relies on <code style="color: var(--accent-primary);">session.withTransaction()</code> to orchestrate atomic slot reservations across <code style="color: var(--text-main);">bookings</code> and <code style="color: var(--text-main);">stations</code>. Test commit vs automated rollback behavior:
        </p>

        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem;">
          <button id="btn-tx-commit" class="btn btn-primary btn-sm" type="button">
            ✅ Simulate Atomic Commit (Successful Booking)
          </button>
          <button id="btn-tx-abort" class="btn btn-secondary btn-sm" type="button" style="border-color: var(--status-faulted);">
            ⚠️ Simulate Injected Fault & Rollback
          </button>
        </div>

        <div id="tx-results" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <div style="font-weight: 700; font-size: 1rem;">Transaction Execution Result:</div>
            <span id="tx-badge" class="badge"></span>
          </div>

          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Operation Trace Log:</div>
            <ul id="tx-trace-list" style="list-style: none; padding: 0; margin: 0; font-size: 0.82rem; display: flex; flex-direction: column; gap: 0.35rem; background: var(--bg-card); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);"></ul>
          </div>

          <div style="font-size: 0.82rem; color: var(--text-secondary);">
            Execution Latency: <strong id="tx-duration" style="color: var(--text-main);"></strong> | Persistence Status: <strong id="tx-persisted" style="color: var(--text-main);"></strong>
          </div>
        </div>
      </div>
    `;

    const runTx = async abort => {
      try {
        const res = await api.post('/lab/transaction-demo', { abort });
        const data = res.data;
        const isCommitted = data.transactionStatus === 'COMMITTED';

        const badge = document.getElementById('tx-badge');
        badge.className = `badge ${isCommitted ? 'badge-success' : 'badge-danger'}`;
        badge.textContent = data.transactionStatus;

        const traceList = document.getElementById('tx-trace-list');
        traceList.innerHTML = (data.logTrace || [])
          .map(
            t =>
              `<li style="padding: 0.2rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: monospace;">${t}</li>`
          )
          .join('');

        document.getElementById('tx-duration').textContent = `${data.durationMillis} ms`;
        document.getElementById('tx-persisted').textContent = data.persistedInDatabase
          ? 'PERSISTED (Cleaned up afterwards)'
          : 'ROLLED BACK (0 records written)';

        document.getElementById('tx-results').style.display = 'block';
        toast.info(`Transaction ${data.transactionStatus}`);
      } catch (err) {
        toast.error('Transaction demo failed: ' + err.message);
      }
    };

    document.getElementById('btn-tx-commit')?.addEventListener('click', () => runTx(false));
    document.getElementById('btn-tx-abort')?.addEventListener('click', () => runTx(true));
  }

  // ================= TAB 5: DATA MODEL & STORAGE =================
  async renderDataModelTab(slot) {
    slot.innerHTML = `
      <div class="card" style="padding: 1.5rem; margin-bottom: 1.5rem;">
        <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">Cluster Schema Inventory & Storage Footprint</h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          Active collections, document allocations, and index coverage retrieved from <code style="color: var(--accent-primary);">collStats</code>.
        </p>

        <div id="datamodel-loading" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
          Querying cluster statistics...
        </div>

        <div id="datamodel-content" style="display: none;">
          <div style="overflow-x: auto;">
            <table class="table" style="width: 100%; font-size: 0.85rem;">
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>Engine Type</th>
                  <th>Doc Count</th>
                  <th>Storage Size</th>
                  <th>Index Size</th>
                  <th>Active Indexes</th>
                </tr>
              </thead>
              <tbody id="datamodel-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    try {
      const res = await api.get('/lab/schema-summary');
      const data = res.data;
      const tbody = document.getElementById('datamodel-tbody');

      tbody.innerHTML = (data.collections || [])
        .map(col => {
          const typeBadge = col.isTimeSeries
            ? '<span class="badge badge-info">Time-Series</span>'
            : '<span class="badge badge-secondary">Standard</span>';
          const sizeKb = (col.storageSizeBytes / 1024).toFixed(1);
          const idxKb = (col.totalIndexSizeBytes / 1024).toFixed(1);
          const indexNames = (col.indexes || [])
            .map(idx => {
              const flags = [];
              if (idx.unique) flags.push('unique');
              if (idx.partial) flags.push('partial');
              if (idx.ttlSeconds) flags.push(`TTL:${idx.ttlSeconds}s`);
              const flagStr = flags.length ? ` (${flags.join(',')})` : '';
              return `<span style="display: inline-block; background: var(--bg-card); padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.72rem; margin: 0.1rem;">${idx.name}${flagStr}</span>`;
            })
            .join(' ');

          return `
            <tr>
              <td><strong>${col.collection}</strong></td>
              <td>${typeBadge}</td>
              <td>${col.documentCount.toLocaleString()}</td>
              <td>${sizeKb} KB</td>
              <td>${idxKb} KB</td>
              <td style="max-width: 320px;">${indexNames}</td>
            </tr>
          `;
        })
        .join('');

      document.getElementById('datamodel-loading').style.display = 'none';
      document.getElementById('datamodel-content').style.display = 'block';
    } catch (err) {
      document.getElementById('datamodel-loading').innerHTML = `
        <div style="color: var(--status-faulted);">Failed to load schema summary: ${err.message}</div>
      `;
    }
  }

  destroy() {
    // cleanup
  }
}
