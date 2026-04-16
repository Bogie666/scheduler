import React from 'react';
import { createRoot } from 'react-dom/client';
import SchedulerWidget from './SchedulerWidget';
import './MembersSchedulerWidget.css';

// ── LEX Members brand palette ──────────────────────────────────
const NAVY = '#0e2a4a';
const GOLD = '#C9A14A';

// HVAC system-count options shared by Spring and Fall tune-ups.
const hvacSystemIssues = [
  { id: 'members-hvac-1-system', label: '1 System' },
  { id: 'members-hvac-2-system', label: '2 Systems' },
  { id: 'members-hvac-3-system', label: '3 Systems' },
  { id: 'members-hvac-4-system', label: '4 Systems' },
  { id: 'members-hvac-5-system', label: '5 Systems' },
  { id: 'members-hvac-6-system', label: '6+ Systems' },
];

const memberServices = {
  'spring-tune-up': {
    name: 'Spring Tune-Up',
    icon: '☀️',
    color: GOLD,
    issueHeading: 'How many systems do you have?',
    issues: hvacSystemIssues,
  },
  'fall-tune-up': {
    name: 'Fall Tune-Up',
    icon: '🍂',
    color: GOLD,
    issueHeading: 'How many systems do you have?',
    issues: hvacSystemIssues,
  },
  'plumbing-inspection': {
    name: 'Plumbing Inspection',
    icon: '🔧',
    color: NAVY,
    issues: [{ id: 'members-plumbing-inspection', label: 'Schedule Plumbing Inspection' }],
  },
  'electrical-inspection': {
    name: 'Electrical Inspection',
    icon: '⚡',
    color: NAVY,
    issues: [{ id: 'members-electrical-inspection', label: 'Schedule Electrical Inspection' }],
  },
};

// Helpers copied from the main entry (kept local to avoid cross-bundle imports).
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function initLEXMembersScheduler(config = {}) {
  const {
    buttonSelector = null,
    autoButton = true,
    buttonText = 'Schedule Member Service',
    apiEndpoint = 'https://scheduler-mu-three.vercel.app/api/lex-booking',
    position = 'bottom-right',
    baseUrl = 'https://scheduler-mu-three.vercel.app',
    logoUrl = null,
    headerColor = NAVY,
    buttonColor = GOLD,
    buttonOffsetX = 24,
    buttonOffsetY = 24,
    tagline = 'Exclusive Service for LEX Members',
    phoneNumber = '(972) 466-1917',
    headerTitle = 'Member Scheduling',
    headerSubtitle = 'Seasonal Tune-Ups • Inspections',
    step1Heading = 'Which service would you like to schedule?',
    services = memberServices,
    timeSlots,
  } = config;

  let container = null;
  let root = null;
  let isOpen = false;

  function createContainer() {
    container = document.createElement('div');
    container.id = 'lex-members-scheduler-root';
    document.documentElement.appendChild(container);
    root = createRoot(container);
  }

  function openScheduler() {
    if (!container) createContainer();
    isOpen = true;
    root.render(
      <SchedulerWidget
        onClose={closeScheduler}
        apiEndpoint={apiEndpoint}
        baseUrl={baseUrl}
        logoUrl={logoUrl}
        headerColor={headerColor}
        tagline={tagline}
        phoneNumber={phoneNumber}
        services={services}
        timeSlots={timeSlots}
        headerTitle={headerTitle}
        headerSubtitle={headerSubtitle}
        step1Heading={step1Heading}
      />
    );
    document.documentElement.style.overflow = 'hidden';
  }

  function closeScheduler() {
    if (root) root.render(null);
    isOpen = false;
    document.documentElement.style.overflow = '';
  }

  function toggleScheduler() {
    if (isOpen) closeScheduler(); else openScheduler();
  }

  function createFloatingButton() {
    const button = document.createElement('button');
    button.id = 'lex-members-scheduler-trigger';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span>${buttonText}</span>
    `;

    const getPositionStyles = () => {
      switch (position) {
        case 'bottom-left':  return `bottom: ${buttonOffsetY}px; left: ${buttonOffsetX}px;`;
        case 'middle-right': return `top: 50%; right: ${buttonOffsetX}px; transform: translateY(-50%);`;
        case 'middle-left':  return `top: 50%; left: ${buttonOffsetX}px; transform: translateY(-50%);`;
        case 'bottom-right':
        default:             return `bottom: ${buttonOffsetY}px; right: ${buttonOffsetX}px;`;
      }
    };

    const darkerColor = adjustColor(buttonColor, -20);

    button.setAttribute('style', `
      position: fixed;
      ${getPositionStyles()}
      z-index: 999998;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 24px;
      background: linear-gradient(135deg, ${buttonColor} 0%, ${darkerColor} 100%);
      color: ${NAVY};
      border: none;
      border-radius: 50px;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 20px ${hexToRgba(buttonColor, 0.45)};
      transition: all 0.2s ease;
    `);

    const isMiddle = position === 'middle-right' || position === 'middle-left';

    button.addEventListener('mouseenter', () => {
      button.style.transform = isMiddle ? 'translateY(calc(-50% - 2px))' : 'translateY(-2px)';
      button.style.boxShadow = `0 6px 28px ${hexToRgba(buttonColor, 0.55)}`;
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = isMiddle ? 'translateY(-50%)' : 'translateY(0)';
      button.style.boxShadow = `0 4px 20px ${hexToRgba(buttonColor, 0.45)}`;
    });

    button.addEventListener('click', openScheduler);
    document.body.appendChild(button);

    return button;
  }

  function init() {
    if (buttonSelector) {
      const existingButtons = document.querySelectorAll(buttonSelector);
      existingButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          openScheduler();
        });
      });
    }

    if (autoButton && !buttonSelector) {
      createFloatingButton();
    }

    window.LEXMembersScheduler = {
      open: openScheduler,
      close: closeScheduler,
      toggle: toggleScheduler,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    open: openScheduler,
    close: closeScheduler,
    toggle: toggleScheduler,
  };
}

if (typeof window !== 'undefined') {
  window.initLEXMembersScheduler = initLEXMembersScheduler;
  if (window.LEXMembersSchedulerConfig) {
    initLEXMembersScheduler(window.LEXMembersSchedulerConfig);
  }
}

export default initLEXMembersScheduler;
