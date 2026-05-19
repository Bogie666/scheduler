import React, { useState, useEffect, useRef, useCallback } from 'react';

const defaultServices = {
  cooling: {
    name: 'Cooling',
    icon: '❄️',
    color: '#0077B6',
    issues: [
      { id: 'ac-not-cooling',      label: 'AC Not Cooling' },
      { id: 'hvac-maintenance',    label: 'Maintenance / Tune-Up' },
      { id: 'new-system',          label: 'New System Estimate' },
      { id: 'strange-noises',      label: 'Strange Noises' },
      { id: 'hvac-other',          label: 'Other AC Issue' },
    ]
  },
  heating: {
    name: 'Heating',
    icon: '🔥',
    color: '#E05A2B',
    issues: [
      { id: 'heater-not-working',  label: 'Heater Not Working' },
      { id: 'hvac-maintenance',    label: 'Maintenance / Tune-Up' },
      { id: 'new-system',          label: 'New System Estimate' },
      { id: 'strange-noises',      label: 'Strange Noises' },
      { id: 'hvac-other',          label: 'Other Heating Issue' },
    ]
  },
  plumbing: {
    name: 'Plumbing',
    icon: '🔧',
    color: '#0096C7',
    issues: [
      { id: 'leak',            label: 'Leak / Dripping' },
      { id: 'clogged-drain',   label: 'Clogged Drain' },
      { id: 'water-heater',    label: 'Water Heater Issue' },
      { id: 'no-hot-water',    label: 'No Hot Water' },
      { id: 'toilet-issue',    label: 'Toilet Problem' },
      { id: 'plumbing-other',  label: 'Other Plumbing Issue' },
    ]
  },
  electrical: {
    name: 'Electrical',
    icon: '⚡',
    color: '#F77F00',
    issues: [
      { id: 'outlet-not-working', label: 'Outlet Not Working' },
      { id: 'breaker-tripping',   label: 'Breaker Keeps Tripping' },
      { id: 'lighting-issue',     label: 'Lighting Issue' },
      { id: 'panel-upgrade',      label: 'Panel Upgrade' },
      { id: 'ceiling-fan',        label: 'Ceiling Fan Install' },
      { id: 'electrical-other',   label: 'Other Electrical Issue' },
    ]
  }
};

const defaultTimeSlots = [
  { id: 'morning',         label: 'Morning',         time: '8am - 12pm' },
  { id: 'afternoon',       label: 'Afternoon',        time: '12pm - 5pm' },
  { id: 'first-available', label: 'First Available',  time: 'ASAP'       },
];

export default function App({
  onClose,
  apiEndpoint: apiEndpointProp,
  baseUrl,
  logoUrl,
  headerColor,
  tagline,
  phoneNumber,
  services: servicesProp,
  timeSlots: timeSlotsProp,
  headerTitle,
  headerSubtitle,
  step1Heading,
  step2Heading,
  step2Placeholder,
}) {
  const services = servicesProp || defaultServices;
  const timeSlots = timeSlotsProp || defaultTimeSlots;

  // ── Funnel tracking beacon (fire-and-forget) ───────────────
  const beaconFunnel = useCallback((type, extras = {}) => {
    const cfg = window.LEXSchedulerConfig || window.LEXMembersSchedulerConfig || {};
    const url = cfg.funnelEndpoint || 'https://lexperks.com/api/funnel/event';
    const payload = {
      type,
      code:       cfg.referralCode || cfg.referralSlug || undefined,
      session_id: cfg.sessionId || undefined,
      metadata:   Object.keys(extras).length ? extras : undefined,
    };
    try {
      fetch(url, {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        keepalive: true,
        body:      JSON.stringify(payload),
      }).catch(() => {});
    } catch (e) {}
  }, []);

  const [isOpen,        setIsOpen]        = useState(true);
  const [step,          setStep]          = useState(1);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError,   setSubmitError]   = useState('');

  // ── Availability state ─────────────────────────────────────
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots,   setLoadingSlots]   = useState(false);
  const [slotsError,     setSlotsError]     = useState(false);

  // ── Referral code state ──────────���───────────────────────────
  const [referralCodeSource, setReferralCodeSource] = useState(null);

  const [formData, setFormData] = useState({
    serviceType:  '',
    issue:        '',
    issueDetails: '',
    firstName:    '',
    lastName:     '',
    phone:        '',
    email:        '',
    address:      '',
    city:         '',
    zip:          '',
    preferredDate: '',
    preferredTime: '',
    referralCode:  '',
  });

  // ── Read referral code from URL on mount ─────────────────────
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const codeFromUrl = params.get('r') || params.get('code') || params.get('referral');
      if (codeFromUrl) {
        const cleaned = codeFromUrl.trim().toUpperCase();
        setFormData(prev => ({ ...prev, referralCode: cleaned }));
        setReferralCodeSource('url');
      }
    } catch (e) {}
    beaconFunnel('scheduler_opened');
  }, []);

  // ── Fetch live availability when reaching Step 4 ────────────
  useEffect(() => {
    if (step !== 4 || !formData.issue) return;
    setLoadingSlots(true);
    setSlotsError(false);
    setAvailableSlots([]);

    const apiBase = apiEndpointProp || window.LEXSchedulerConfig?.apiEndpoint || 'https://scheduler-mu-three.vercel.app/api/lex-booking';
    const base = apiBase.replace('/api/lex-booking', '');
    fetch(`${base}/api/availability?issue=${formData.issue}`)
      .then(r => r.json())
      .then(data => setAvailableSlots(data.slots || []))
      .catch(() => setSlotsError(true))
      .finally(() => setLoadingSlots(false));
  }, [step, formData.issue]);

  // ── Refs for auto-scroll ─────────────────────────────────────
  const contentRef      = useRef(null);
  const issueRef        = useRef(null);
  const stepActionsRef  = useRef(null);

  // Scroll content area to top when step changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  // Scroll issue selection or actions into view after a service/issue pick
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const target = stepActionsRef.current || issueRef.current;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }, []);

  const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
  const nextStep    = () => setStep(s => s + 1);
  const prevStep    = () => setStep(s => s - 1);

  // ── Submit booking ──────────��─────────────────────────────────
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const apiEndpoint = apiEndpointProp || window.LEXSchedulerConfig?.apiEndpoint || 'https://scheduler-mu-three.vercel.app/api/lex-booking';

      const payload = {
        serviceType:   formData.serviceType,
        issue:         formData.issue,
        issueDetails:  formData.issueDetails,
        firstName:     formData.firstName,
        lastName:      formData.lastName,
        phone:         formData.phone,
        email:         formData.email,
        address:       formData.address,
        city:          formData.city,
        zip:           formData.zip,
        preferredDate: formData.preferredDate,
        preferredTime: formData.preferredTime,
        referralCode:  formData.referralCode.trim().toUpperCase() || null,
      };

      const response = await fetch(apiEndpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || `Request failed (${response.status})`);
      }

      beaconFunnel('booking_confirmed', { st_job_id: result.jobId || undefined });
      setSubmitSuccess(true);
      setStep(5);

    } catch (err) {
      console.error('[Scheduler] Submit error:', err);
      setSubmitError(err.message || 'Something went wrong. Please call us at (972) 466-1917.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedService = services[formData.serviceType];

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  const hdrColor = headerColor || '#133865';
  const phone = phoneNumber || '(972) 466-1917';
  const tag = tagline || 'The Gold Standard of White Glove Service';

  return (
    <div className="lex-scheduler-overlay">
      <div className="lex-scheduler-modal">

        {/* Header */}
        <div className="lex-scheduler-header" style={{ background: hdrColor }}>
          <div className="lex-header-content">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="lex-header-logo" />
            ) : (
              <div>
                <div style={{ color: 'white', fontSize: '20px', fontWeight: 700 }}>{headerTitle || 'Schedule Service'}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', marginTop: '2px' }}>{headerSubtitle || 'LEX Air Conditioning \u2022 Plumbing \u2022 Electrical'}</div>
              </div>
            )}
          </div>
          <button className="lex-close-btn" onClick={handleClose}>&times;</button>
        </div>

        {/* Progress */}
        <div className="lex-progress-bar">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`lex-progress-step ${step > i ? 'complete' : step === i ? 'active' : ''}`}>
              <div className="lex-step-number">{step > i ? '✓' : i}</div>
              <span className="lex-step-label">{['Service', 'Details', 'Contact', 'Schedule'][i-1]}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="lex-scheduler-content" ref={contentRef}>

          {/* Step 1 — Service selection */}
          {step === 1 && (
            <div className="lex-step-content">
              <h3>{step1Heading || 'What do you need help with?'}</h3>
              <div className="lex-service-grid">
                {Object.entries(services).map(([key, service]) => (
                  <button
                    key={key}
                    onClick={() => {
                      updateField('serviceType', key);
                      // Auto-select the sole issue when a service has exactly one
                      updateField('issue', service.issues.length === 1 ? service.issues[0].id : '');
                      if (service.issues.length > 1) scrollToBottom();
                    }}
                    className={`lex-service-card ${formData.serviceType === key ? 'selected' : ''}`}
                    style={{ '--service-color': service.color }}
                  >
                    <span className="lex-service-icon">{service.icon}</span>
                    <span className="lex-service-name">{service.name}</span>
                  </button>
                ))}
              </div>

              {selectedService && selectedService.issues.length > 1 && (
                <div className="lex-issue-selection" ref={issueRef}>
                  <h4>{selectedService.issueHeading || "What's the issue?"}</h4>
                  <div className="lex-issue-grid">
                    {selectedService.issues.map(issue => (
                      <button
                        key={issue.id}
                        onClick={() => { updateField('issue', issue.id); scrollToBottom(); }}
                        className={`lex-issue-btn ${formData.issue === issue.id ? 'selected' : ''}`}
                        style={{ '--service-color': selectedService.color }}
                      >
                        {issue.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Referral code banner — shown if code came from URL */}
              {referralCodeSource === 'url' && formData.referralCode && (
                <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '12px 16px' }}>
                  <span style={{ fontSize: '18px' }}>🎁</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#065f46' }}>Referral code applied: {formData.referralCode}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#059669' }}>You'll save ${window.LEXSchedulerConfig?.discount || '50'} on your first service!</p>
                  </div>
                </div>
              )}

              <div className="lex-step-actions" ref={stepActionsRef}>
                <button className="lex-btn-primary" onClick={nextStep} disabled={!formData.issue}>Continue</button>
              </div>
            </div>
          )}

          {/* Step 2 — Details */}
          {step === 2 && (
            <div className="lex-step-content">
              <h3>{step2Heading || 'Tell us more about the problem'}</h3>
              <p className="lex-subtitle">
                {selectedService?.name}
                {selectedService && selectedService.issues.length > 1 && (
                  <> &rarr; {selectedService.issues.find(i => i.id === formData.issue)?.label}</>
                )}
              </p>
              <div className="lex-form-group">
                <label>Additional details (optional)</label>
                <textarea
                  rows={4}
                  placeholder={step2Placeholder || "Describe what's happening, any error codes, how long it's been going on, etc."}
                  value={formData.issueDetails}
                  onChange={(e) => updateField('issueDetails', e.target.value)}
                />
              </div>
              <div className="lex-step-actions">
                <button className="lex-btn-secondary" onClick={prevStep}>Back</button>
                <button className="lex-btn-primary" onClick={nextStep}>Continue</button>
              </div>
            </div>
          )}

          {/* Step 3 — Contact info */}
          {step === 3 && (
            <div className="lex-step-content">
              <h3>Your contact information</h3>
              <div className="lex-form-row">
                <div className="lex-form-group">
                  <label>First Name *</label>
                  <input type="text" value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
                </div>
                <div className="lex-form-group">
                  <label>Last Name *</label>
                  <input type="text" value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
                </div>
              </div>
              <div className="lex-form-row">
                <div className="lex-form-group">
                  <label>Phone *</label>
                  <input type="tel" placeholder="(214) 555-1234" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} />
                </div>
                <div className="lex-form-group">
                  <label>Email</label>
                  <input type="email" placeholder="you@email.com" value={formData.email} onChange={(e) => updateField('email', e.target.value)} />
                </div>
              </div>
              <div className="lex-form-group">
                <label>Service Address *</label>
                <input type="text" placeholder="123 Main St" value={formData.address} onChange={(e) => updateField('address', e.target.value)} />
              </div>
              <div className="lex-form-row">
                <div className="lex-form-group">
                  <label>City *</label>
                  <input type="text" value={formData.city} onChange={(e) => updateField('city', e.target.value)} />
                </div>
                <div className="lex-form-group lex-form-group-small">
                  <label>ZIP *</label>
                  <input type="text" placeholder="75024" value={formData.zip} onChange={(e) => updateField('zip', e.target.value)} />
                </div>
              </div>

              {/* ─�� Referral code field ────────────────────────── */}
              <div className="lex-form-group">
                <label>
                  Referral Code
                  <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '8px' }}>(optional)</span>
                </label>
                {referralCodeSource === 'url' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#ecfdf5', border: '2px solid #6ee7b7', borderRadius: '8px' }}>
                    <span style={{ color: '#059669' }}>��</span>
                    <span style={{ fontWeight: 600, color: '#065f46', letterSpacing: '0.05em' }}>{formData.referralCode}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#059669', fontWeight: 500 }}>Applied ✓</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. SARAH-1917"
                    value={formData.referralCode}
                    onChange={(e) => {
                      updateField('referralCode', e.target.value.toUpperCase());
                      setReferralCodeSource(e.target.value ? 'manual' : null);
                    }}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace' }}
                  />
                )}
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                  Have a code from a friend? Enter it here to save on your service.
                </p>
              </div>

              <div className="lex-step-actions">
                <button className="lex-btn-secondary" onClick={prevStep}>Back</button>
                <button
                  className="lex-btn-primary"
                  onClick={() => { beaconFunnel('customer_info_submitted'); nextStep(); }}
                  disabled={!formData.firstName || !formData.lastName || !formData.phone || !formData.address || !formData.city || !formData.zip}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Schedule */}
          {step === 4 && (
            <div className="lex-step-content">
              <h3>When works best for you?</h3>
              <div className="lex-form-group">
                <label>Preferred Date</label>
                <div className="lex-date-grid">
                  {loadingSlots ? (
                    <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#64748b', fontSize: '14px', padding: '12px 0' }}>
                      Checking availability...
                    </p>
                  ) : slotsError ? (
                    <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#991b1b', fontSize: '14px', padding: '12px 0' }}>
                      Unable to load availability. Please call us at (972) 466-1917.
                    </p>
                  ) : availableSlots.length === 0 ? (
                    <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#64748b', fontSize: '14px', padding: '12px 0' }}>
                      No available dates found in the next 14 days. Please call (972) 466-1917.
                    </p>
                  ) : (
                    availableSlots.map(slot => {
                      const d = new Date(slot.date + 'T12:00:00');
                      return (
                        <button
                          key={slot.date}
                          onClick={() => updateField('preferredDate', slot.date)}
                          className={`lex-date-btn ${formData.preferredDate === slot.date ? 'selected' : ''}`}
                        >
                          {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="lex-form-group">
                <label>Preferred Time</label>
                <div className="lex-time-grid">
                  {timeSlots.map(slot => (
                    <button
                      key={slot.id}
                      onClick={() => { updateField('preferredTime', slot.id); beaconFunnel('slot_selected', { slot_id: slot.id }); }}
                      className={`lex-time-btn ${formData.preferredTime === slot.id ? 'selected' : ''}`}
                    >
                      <span className="lex-time-label">{slot.label}</span>
                      <span className="lex-time-range">{slot.time}</span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="lex-availability-note">
                Appointment times are subject to availability. We'll confirm your time by phone.
              </p>

              {submitError && (
                <div className="lex-error-message">{submitError}</div>
              )}

              <div className="lex-step-actions">
                <button className="lex-btn-secondary" onClick={prevStep}>Back</button>
                <button
                  className="lex-btn-primary"
                  onClick={handleSubmit}
                  disabled={!formData.preferredDate || !formData.preferredTime || isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Request Appointment'}
                </button>
              </div>
            </div>
          )}

          {/* Step 5 — Confirmation */}
          {step === 5 && submitSuccess && (
            <div className="lex-confirmation">
              <div className="lex-success-icon">✓</div>
              <h3>Request Received!</h3>
              <div className="lex-confirmation-details">
                <p>Thanks, {formData.firstName}! We've received your {selectedService?.name.toLowerCase()} service request.</p>
                <p>A member of our team will call you shortly to confirm your appointment.</p>
              </div>

              <div className="lex-confirmation-summary">
                {[
                  ['Service',        selectedService?.name],
                  ['Issue',          selectedService && selectedService.issues.length > 1
                                       ? selectedService.issues.find(i => i.id === formData.issue)?.label
                                       : null],
                  ['Preferred Date', formData.preferredDate && new Date(formData.preferredDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })],
                  ['Preferred Time', timeSlots.find(t => t.id === formData.preferredTime)?.label],
                  ...(formData.referralCode ? [['Referral Code', formData.referralCode]] : []),
                ].map(([label, value]) => value ? (
                  <div key={label} className="lex-summary-row">
                    <span>{label}:</span>
                    <span>{value}</span>
                  </div>
                ) : null)}
              </div>

              {formData.referralCode && (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '14px 18px', color: '#065f46', fontSize: '14px', marginBottom: '16px', textAlign: 'left' }}>
                  🎁 Referral code <strong>{formData.referralCode}</strong> has been applied. Your discount will be reflected on your final invoice.
                </div>
              )}

              <div className="lex-emergency-note">
                <strong>Emergency?</strong> Call us now at <a href="tel:9724661917">{phone}</a>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="lex-scheduler-footer">
          <p>{tag}</p>
          <p>Need immediate help? <a href="tel:9724661917">{phone}</a></p>
        </div>

      </div>
    </div>
  );
}
