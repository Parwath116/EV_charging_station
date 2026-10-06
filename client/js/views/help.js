/**
 * Help & Expandable FAQ View
 * Accessible accordion with live search filter and VoltGrid operational guidance.
 */

const FAQ_DATA = [
  {
    category: 'Booking & Reservations',
    question: 'How do I reserve an EV charging slot in advance?',
    answer:
      'Navigate to the Network Map or Stations Directory, select your desired charging hub in Bengaluru, choose an available dispenser connector (e.g. CCS2 120kW), and select your desired time slot. VoltGrid enforces multi-document transactional locking to guarantee your slot is conflict-free and held exclusively for your vehicle.',
  },
  {
    category: 'Booking & Reservations',
    question: 'What happens if I arrive late for my booked reservation?',
    answer:
      'Reservations are held for a 15-minute grace window from the scheduled start time. If the vehicle is not plugged in within 15 minutes, the reservation status shifts to cancelled to release grid capacity for other motorists, and any unused slot credits are refunded to your platform wallet.',
  },
  {
    category: 'Billing & Wallet',
    question: 'How does the VoltGrid driver wallet balance function?',
    answer:
      'VoltGrid operates on a prepaid automated settlement model. Drivers maintain a wallet balance in Indian Rupees (INR). When a charging session terminates, the energy delivery (kWh) multiplied by the station tariff is calculated and atomically debited from your wallet using MongoDB $inc operations.',
  },
  {
    category: 'Billing & Wallet',
    question: 'What are the current electricity tariffs across Bengaluru stations?',
    answer:
      'Tariffs vary between ₹15.50/kWh and ₹19.50/kWh depending on station power capabilities (standard 22kW AC vs high-power 150kW DC fast dispensers), corridor commercial rates, and peak hour demand schedules. Live tariffs are transparently published on each station popup on the map.',
  },
  {
    category: 'Charger Types & Hardware',
    question: 'Which connector standard does my electric vehicle require?',
    answer:
      'Most modern four-wheeler electric vehicles in India (Tata Nexon EV, MG ZS EV, Hyundai Ioniq 5, Mahindra XUV400, BYD Atto 3) utilize CCS2 for DC fast charging and Type 2 for slower AC destination charging. Selected older models or fleet imports utilize CHAdeMO or GB/T. All VoltGrid station cards explicitly list available connector types.',
  },
  {
    category: 'Charger Types & Hardware',
    question: 'What is the operational difference between 22kW AC and 120kW DC fast charging?',
    answer:
      '22kW AC chargers supply alternating current to your vehicle on-board charger (typically replenishing 10% to 80% in 3 to 6 hours), ideal for workplace and shopping mall dwell times. 120kW/150kW DC fast chargers bypass the on-board charger and feed direct current straight to the battery pack, providing an 80% charge in 25 to 40 minutes.',
  },
  {
    category: 'Account & Vehicle Management',
    question: 'Can I register multiple vehicles to a single driver account?',
    answer:
      'Yes. Drivers can add multiple vehicles (with designated battery pack capacities and connector types) directly in their profile settings. During slot booking, you can select which vehicle you are driving to automatically filter incompatible charger guns.',
  },
  {
    category: 'Troubleshooting & Support',
    question: 'What should I do if a charger dispenser displays an error or fails to lock?',
    answer:
      'If the electronic connector lock fails or the dispenser flags an OCPP fault code, terminate the session in the app and inspect the physical emergency stop button on the unit. Our real-time IoT monitoring stream will automatically flag an anomaly alert to the corridor station operator for technical resolution.',
  },
  {
    category: 'Troubleshooting & Support',
    question: 'How does VoltGrid handle thermal throttling and hardware overheating?',
    answer:
      'All high-power DC dispensers stream temperature telemetry into our MongoDB time-series collection every few seconds. If a connector temperature exceeds 65°C, automated grid safety rules trigger an alert and dynamically throttle current to protect battery thermal integrity.',
  },
];

export const HelpView = {
  render(container) {
    container.innerHTML = `
      <div style="max-width:800px; margin:0 auto;">
        <div style="text-align:center; margin-bottom:2.5rem;">
          <span class="hero-badge">Documentation & Support</span>
          <h1 style="font-size:2rem; font-weight:800; margin-top:0.5rem;">VoltGrid Help Center</h1>
          <p style="color:var(--text-secondary); max-width:550px; margin:0.5rem auto 1.5rem;">
            Find guidance on reserving slots, billing tariffs, connector compatibility, and hardware troubleshooting.
          </p>

          <!-- Live Search Input -->
          <div style="max-width:500px; margin:0 auto; position:relative;">
            <input
              id="faq-search"
              class="form-input"
              type="search"
              placeholder="Filter topics (e.g., CCS2, tariff, wallet, thermal)... (Press /)"
              aria-label="Filter FAQ topics"
              style="padding-left:2.5rem;"
            />
            <span style="position:absolute; left:0.85rem; top:50%; transform:translateY(-50%); color:var(--text-muted);" aria-hidden="true">🔍</span>
          </div>
        </div>

        <!-- Accordion Container -->
        <div id="faq-list" class="faq-accordion" role="region" aria-label="Frequently Asked Questions"></div>
      </div>
    `;

    const faqList = container.querySelector('#faq-list');
    const searchInput = container.querySelector('#faq-search');

    const renderFaqs = query => {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? FAQ_DATA.filter(
            f =>
              f.question.toLowerCase().includes(q) ||
              f.answer.toLowerCase().includes(q) ||
              f.category.toLowerCase().includes(q)
          )
        : FAQ_DATA;

      if (filtered.length === 0) {
        faqList.innerHTML = `
          <div style="text-align:center; padding:3rem; color:var(--text-muted);">
            No FAQ articles found matching "<strong>${query}</strong>". Try a broader search term.
          </div>
        `;
        return;
      }

      faqList.innerHTML = filtered
        .map(
          (faq, index) => `
        <div class="faq-item" id="faq-item-${index}">
          <button
            class="faq-trigger"
            id="faq-trigger-${index}"
            type="button"
            aria-expanded="false"
            aria-controls="faq-panel-${index}"
          >
            <span>${faq.question}</span>
            <span class="faq-icon" aria-hidden="true">▼</span>
          </button>
          <div
            class="faq-panel"
            id="faq-panel-${index}"
            role="region"
            aria-labelledby="faq-trigger-${index}"
          >
            <div class="faq-panel-content">
              <span class="brand-sub" style="margin-bottom:0.5rem; display:inline-block;">${faq.category}</span>
              <p>${faq.answer}</p>
            </div>
          </div>
        </div>
      `
        )
        .join('');

      // Attach accordion toggle behavior
      faqList.querySelectorAll('.faq-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = btn.closest('.faq-item');
          const panel = item.querySelector('.faq-panel');
          const isExpanded = btn.getAttribute('aria-expanded') === 'true';

          // Close all other items for clean single-expand behavior
          faqList.querySelectorAll('.faq-item').forEach(otherItem => {
            if (otherItem !== item) {
              otherItem.classList.remove('active');
              otherItem.querySelector('.faq-trigger').setAttribute('aria-expanded', 'false');
              otherItem.querySelector('.faq-panel').style.maxHeight = null;
            }
          });

          if (isExpanded) {
            btn.setAttribute('aria-expanded', 'false');
            item.classList.remove('active');
            panel.style.maxHeight = null;
          } else {
            btn.setAttribute('aria-expanded', 'true');
            item.classList.add('active');
            panel.style.maxHeight = `${panel.scrollHeight}px`;
          }
        });
      });
    };

    renderFaqs('');

    searchInput.addEventListener('input', e => {
      renderFaqs(e.target.value);
    });
  },
};
