import React from 'react';
import { createRoot } from 'react-dom/client';
import SchedulerWidget from './SchedulerWidget';
import './SchedulerWidget.css';

// Helper function to convert hex to rgba
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Helper function to adjust color brightness
function adjustColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// Widget initialization function
function initLEXScheduler(config = {}) {
  const {
    buttonSelector = null,       // Optional: CSS selector for existing button
    autoButton = true,           // Create floating button if no selector provided
    buttonText = 'Book Online',
    apiEndpoint = '/api/lex-booking',
    position = 'bottom-right',   // bottom-right, bottom-left
    baseUrl = 'https://scheduler-mu-three.vercel.app', // CDN base URL for assets
    // Customization options
    logoUrl = null,              // Custom logo URL (defaults to LEX logo)
    headerColor = '#133865',     // Header background color
    buttonColor = '#0A5C8C',     // Floating button color
    tagline = 'The Gold Standard of White Glove Service',  // Footer tagline
    phoneNumber = '(972) 466-1917',  // Support phone number
  } = config;

  let container = null;
  let root = null;
  let isOpen = false;

  // Create container for widget
  function createContainer() {
    container = document.createElement('div');
    container.id = 'lex-scheduler-root';
    document.body.appendChild(container);
    root = createRoot(container);
  }

  // Open the scheduler
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
      />
    );
    document.body.style.overflow = 'hidden';
  }

  // Close the scheduler
  function closeScheduler() {
    if (root) {
      root.render(null);
    }
    isOpen = false;
    document.body.style.overflow = '';
  }

  // Toggle scheduler
  function toggleScheduler() {
    if (isOpen) {
      closeScheduler();
    } else {
      openScheduler();
    }
  }

  // Create floating button if needed
  function createFloatingButton() {
    const button = document.createElement('button');
    button.id = 'lex-scheduler-trigger';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span>${buttonText}</span>
    `;
    
    // Position styles based on position config
    const getPositionStyles = () => {
      switch (position) {
        case 'bottom-left':
          return 'bottom: 24px; left: 24px;';
        case 'middle-right':
          return 'top: 50%; right: 24px; transform: translateY(-50%);';
        case 'middle-left':
          return 'top: 50%; left: 24px; transform: translateY(-50%);';
        case 'bottom-right':
        default:
          return 'bottom: 24px; right: 24px;';
      }
    };

    // Create darker shade for gradient
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
      color: white;
      border: none;
      border-radius: 50px;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 20px ${hexToRgba(buttonColor, 0.4)};
      transition: all 0.2s ease;
    `);

    const isMiddle = position === 'middle-right' || position === 'middle-left';

    button.addEventListener('mouseenter', () => {
      button.style.transform = isMiddle ? 'translateY(calc(-50% - 2px))' : 'translateY(-2px)';
      button.style.boxShadow = `0 6px 28px ${hexToRgba(buttonColor, 0.5)}`;
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = isMiddle ? 'translateY(-50%)' : 'translateY(0)';
      button.style.boxShadow = `0 4px 20px ${hexToRgba(buttonColor, 0.4)}`;
    });

    button.addEventListener('click', openScheduler);
    document.body.appendChild(button);

    return button;
  }

  // Initialize
  function init() {
    // If a button selector is provided, use that
    if (buttonSelector) {
      const existingButtons = document.querySelectorAll(buttonSelector);
      existingButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          openScheduler();
        });
      });
    }

    // Create floating button if autoButton is true and no selector provided
    if (autoButton && !buttonSelector) {
      createFloatingButton();
    }

    // Expose methods globally
    window.LEXScheduler = {
      open: openScheduler,
      close: closeScheduler,
      toggle: toggleScheduler,
    };
  }

  // Wait for DOM if needed
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

// Auto-initialize if config is found on window
if (typeof window !== 'undefined') {
  window.initLEXScheduler = initLEXScheduler;
  
  // Check for auto-init config
  if (window.LEXSchedulerConfig) {
    initLEXScheduler(window.LEXSchedulerConfig);
  }
}

export default initLEXScheduler;
