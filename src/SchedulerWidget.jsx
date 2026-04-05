import React, { useState, useEffect } from 'react';

const services = {
  hvac: {
    name: 'Heating & Cooling',
    icon: '❄️',
    color: '#0077B6',
    issues: [
      { id: 'ac-not-cooling',      label: 'AC Not Cooling' },
      { id: 'heater-not-working',  label: 'Heater Not Working' },
      { id: 'hvac-maintenance',    label: 'Maintenance / Tune-Up' },
      { id: 'new-system',          label: 'New System Estimate' },
      { id: 'strange-noises',      label: 'Strange Noises' },
      { id: 'hvac-other',          label: 'Other HVAC Issue' },
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

const timeSlots = [
  { id: 'morning',         label: 'Morning',         time: '8am - 12pm' },
  { id: 'afternoon',       label: 'Afternoon',        time: '12pm - 5pm' },
  { id: 'first-available', label: 'First Available',  time: 'ASAP'       },
];

export default function App() {
  const [isOpen,        setIsOpen]        = useState(true);
  const [step,          setStep]          = useState(1);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError,   setSubmitError]   = useState('');

  // ── Referral code state ──────────────────────────────────────
  // referralCodeSource: 'url' | 'manual' | null
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
    referralCode:  '',   // ← new field
  });

  // ── Read referral code from URL on mount ─────────────────────
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // Support both ?r=CODE and ?code=CODE and ?referral=CODE
      const codeFromUrl = params.get('r') || params.get('code') || params.get('referral');
      if (codeFromUrl) {
        const cleaned = codeFromUrl.trim().toUpperCase();
        setFormData(prev => ({ ...prev, referralCode: cleaned }));
        setReferralCodeSource('url');
      }
    } catch (e) {
      // URL parsing can fail in some embed contexts — ignore
    }
  }, []);

  const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
  const nextStep    = () => setStep(s => s + 1);
  const prevStep    = () => setStep(s => s - 1);

  // ── Submit booking ────────────────────────────────────────────
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const apiEndpoint = window.LEXSchedulerConfig?.apiEndpoint || '/api/booking';

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

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Request failed (${response.status})`);
      }

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

  const getAvailableDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      if (date.getDay() !== 0) dates.push(date);
    }
    return dates;
  };

  const formatDate = (date) =>
    date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const resetForm = () => {
    setStep(1);
    setSubmitSuccess(false);
    setSubmitError('');
    setReferralCodeSource(null);
    setFormData({
      serviceType: '', issue: '', issueDetails: '', firstName: '', lastName: '',
      phone: '', email: '', address: '', city: '', zip: '',
      preferredDate: '', preferredTime: '', referralCode: '',
    });
  };

  if (!isOpen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 px-6 py-4 rounded-full text-white font-semibold text-lg shadow-xl hover:scale-105 transition-transform"
          style={{ background: 'linear-gradient(135deg, #0A5C8C 0%, #0B3D5C 100%)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Book Online
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        .lex-widget { font-family: 'Plus Jakarta Sans', sans-serif; }
        .lex-widget input:focus, .lex-widget textarea:focus { outline: none; box-shadow: 0 0 0 3px rgba(10, 92, 140, 0.1); }
      `}</style>

      <div className="lex-widget bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="relative overflow-hidden text-white px-7 py-6" style={{ background: 'linear-gradient(135deg, #0B3D5C 0%, #0A5C8C 100%)' }}>
          <div className="absolute -top-1/2 -right-1/4 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
          <div className="relative flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Schedule Service</h2>
              <p className="text-sm opacity-85 mt-1 font-medium">LEX Air Conditioning • Plumbing • Electrical</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-2xl transition-colors">×</button>
          </div>
        </div>

        {/* Progress */}
        <div className="flex px-7 py-5 gap-2 bg-slate-50 border-b border-slate-200">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step >= i ? (step > i ? 'bg-emerald-500 text-white' : 'bg-sky-700 text-white shadow-md') : 'bg-slate-200 text-slate-400'}`}>
                {step > i ? '✓' : i}
              </div>
              <span className={`text-xs font-medium uppercase tracking-wide ${step >= i ? 'text-slate-600' : 'text-slate-400'}`}>
                {['Service', 'Details', 'Contact', 'Schedule'][i-1]}
              </span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-7">

          {/* Step 1 — Service selection */}
          {step === 1 && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">What do you need help with?</h3>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {Object.entries(services).map(([key, service]) => (
                  <button
                    key={key}
                    onClick={() => { updateField('serviceType', key); updateField('issue', ''); }}
                    className={`p-5 rounded-xl border-2 flex flex-col items-center gap-2 transition-all hover:border-sky-600 ${formData.serviceType === key ? 'border-sky-600 bg-sky-50 shadow-md' : 'border-slate-200 bg-white'}`}
                  >
                    <span className="text-3xl">{service.icon}</span>
                    <span className="text-sm font-semibold text-slate-700">{service.name}</span>
                  </button>
                ))}
              </div>

              {selectedService && (
                <div>
                  <h4 className="text-base font-semibold text-slate-700 mb-3">What's the issue?</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedService.issues.map(issue => (
                      <button
                        key={issue.id}
                        onClick={() => updateField('issue', issue.id)}
                        className={`px-4 py-3 rounded-lg border-2 text-sm font-medium text-left transition-all hover:border-sky-600 ${formData.issue === issue.id ? 'border-sky-600 bg-sky-50' : 'border-slate-200 text-slate-600'}`}
                      >
                        {issue.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Referral code banner — shown if code came from URL */}
              {referralCodeSource === 'url' && formData.referralCode && (
                <div className="mt-5 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <span className="text-emerald-600 text-lg">🎁</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Referral code applied: {formData.referralCode}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">You'll save ${window.LEXSchedulerConfig?.discount || '50'} on your first service!</p>
                  </div>
                </div>
              )}

              <div className="mt-7 pt-6 border-t border-slate-200">
                <button onClick={nextStep} disabled={!formData.issue} className="w-full py-4 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg" style={{ background: 'linear-gradient(135deg, #0A5C8C 0%, #0B3D5C 100%)' }}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Details */}
          {step === 2 && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Tell us more about the problem</h3>
              <p className="text-sm text-slate-500 bg-slate-50 px-4 py-3 rounded-lg border-l-4 border-sky-600 mb-6">
                {selectedService?.name} → {selectedService?.issues.find(i => i.id === formData.issue)?.label}
              </p>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Additional details (optional)</label>
              <textarea
                rows={4}
                placeholder="Describe what's happening, any error codes, how long it's been going on, etc."
                value={formData.issueDetails}
                onChange={(e) => updateField('issueDetails', e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg text-base focus:border-sky-600 transition-colors resize-none"
              />
              <div className="mt-7 pt-6 border-t border-slate-200 flex gap-3">
                <button onClick={prevStep} className="px-6 py-4 rounded-lg border-2 border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">Back</button>
                <button onClick={nextStep} className="flex-1 py-4 rounded-lg text-white font-semibold transition-all hover:shadow-lg" style={{ background: 'linear-gradient(135deg, #0A5C8C 0%, #0B3D5C 100%)' }}>Continue</button>
              </div>
            </div>
          )}

          {/* Step 3 — Contact info */}
          {step === 3 && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">Your contact information</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">First Name *</label>
                  <input type="text" value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-sky-600 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Last Name *</label>
                  <input type="text" value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-sky-600 transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Phone *</label>
                  <input type="tel" placeholder="(214) 555-1234" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-sky-600 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                  <input type="email" placeholder="you@email.com" value={formData.email} onChange={(e) => updateField('email', e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-sky-600 transition-colors" />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Service Address *</label>
                <input type="text" placeholder="123 Main St" value={formData.address} onChange={(e) => updateField('address', e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-sky-600 transition-colors" />
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">City *</label>
                  <input type="text" value={formData.city} onChange={(e) => updateField('city', e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-sky-600 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">ZIP *</label>
                  <input type="text" placeholder="75024" value={formData.zip} onChange={(e) => updateField('zip', e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-sky-600 transition-colors" />
                </div>
              </div>

              {/* ── Referral code field ────────────────────────── */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Referral Code
                  <span className="text-slate-400 font-normal ml-2">(optional)</span>
                </label>
                {referralCodeSource === 'url' ? (
                  // Code came from URL — show as locked with green badge
                  <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border-2 border-emerald-300 rounded-lg">
                    <span className="text-emerald-600">🎁</span>
                    <span className="font-semibold text-emerald-800 tracking-wide">{formData.referralCode}</span>
                    <span className="ml-auto text-xs text-emerald-600 font-medium">Applied ✓</span>
                  </div>
                ) : (
                  // No URL code — let them type one in
                  <input
                    type="text"
                    placeholder="e.g. SARAH-1917"
                    value={formData.referralCode}
                    onChange={(e) => {
                      updateField('referralCode', e.target.value.toUpperCase());
                      setReferralCodeSource(e.target.value ? 'manual' : null);
                    }}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-sky-600 transition-colors uppercase tracking-wider font-mono"
                  />
                )}
                <p className="text-xs text-slate-400 mt-1.5">
                  Have a code from a friend? Enter it here to save on your service.
                </p>
              </div>

              <div className="mt-7 pt-6 border-t border-slate-200 flex gap-3">
                <button onClick={prevStep} className="px-6 py-4 rounded-lg border-2 border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">Back</button>
                <button
                  onClick={nextStep}
                  disabled={!formData.firstName || !formData.lastName || !formData.phone || !formData.address || !formData.city || !formData.zip}
                  className="flex-1 py-4 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #0A5C8C 0%, #0B3D5C 100%)' }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Schedule */}
          {step === 4 && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">When works best for you?</h3>
              <label className="block text-sm font-semibold text-slate-700 mb-3">Preferred Date</label>
              <div className="grid grid-cols-4 gap-2 mb-6">
                {getAvailableDates().slice(0, 8).map(date => (
                  <button
                    key={date.toISOString()}
                    onClick={() => updateField('preferredDate', date.toISOString().split('T')[0])}
                    className={`py-3 px-2 rounded-lg border-2 text-xs font-medium transition-all ${formData.preferredDate === date.toISOString().split('T')[0] ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 text-slate-600 hover:border-sky-600'}`}
                  >
                    {formatDate(date)}
                  </button>
                ))}
              </div>

              <label className="block text-sm font-semibold text-slate-700 mb-3">Preferred Time</label>
              <div className="grid grid-cols-3 gap-3">
                {timeSlots.map(slot => (
                  <button
                    key={slot.id}
                    onClick={() => updateField('preferredTime', slot.id)}
                    className={`py-4 px-3 rounded-lg border-2 flex flex-col items-center transition-all ${formData.preferredTime === slot.id ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 text-slate-600 hover:border-sky-600'}`}
                  >
                    <span className="font-semibold">{slot.label}</span>
                    <span className="text-xs opacity-80">{slot.time}</span>
                  </button>
                ))}
              </div>

              {submitError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <div className="mt-7 pt-6 border-t border-slate-200 flex gap-3">
                <button onClick={prevStep} className="px-6 py-4 rounded-lg border-2 border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">Back</button>
                <button
                  onClick={handleSubmit}
                  disabled={!formData.preferredDate || !formData.preferredTime || isSubmitting}
                  className="flex-1 py-4 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #0A5C8C 0%, #0B3D5C 100%)' }}
                >
                  {isSubmitting ? 'Submitting...' : 'Request Appointment'}
                </button>
              </div>
            </div>
          )}

          {/* Step 5 — Confirmation */}
          {step === 5 && submitSuccess && (
            <div className="text-center py-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-4xl flex items-center justify-center mx-auto mb-6 shadow-lg">✓</div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Request Received!</h3>
              <p className="text-slate-600 mb-2">Thanks, {formData.firstName}! We've received your {selectedService?.name.toLowerCase()} service request.</p>
              <p className="text-slate-500 text-sm mb-6">A member of our team will call you shortly to confirm your appointment.</p>

              <div className="bg-slate-50 rounded-xl p-5 text-left mb-6">
                {[
                  ['Service',        selectedService?.name],
                  ['Issue',          selectedService?.issues.find(i => i.id === formData.issue)?.label],
                  ['Preferred Date', formData.preferredDate && new Date(formData.preferredDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })],
                  ['Preferred Time', timeSlots.find(t => t.id === formData.preferredTime)?.label],
                  ...(formData.referralCode ? [['Referral Code', formData.referralCode]] : []),
                ].map(([label, value]) => value ? (
                  <div key={label} className="flex justify-between py-2 border-b border-slate-200 last:border-0 text-sm">
                    <span className="text-slate-500 font-medium">{label}:</span>
                    <span className="text-slate-900 font-semibold">{value}</span>
                  </div>
                ) : null)}
              </div>

              {formData.referralCode && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-emerald-800 text-sm mb-4">
                  🎁 Referral code <strong>{formData.referralCode}</strong> has been applied. Your discount will be reflected on your final invoice.
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm mb-6">
                <strong>Emergency?</strong> Call us now at <a href="tel:9724661917" className="font-bold underline">(972) 466-1917</a>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-7 py-4 text-center">
          <p className="text-xs text-slate-500">The Gold Standard of White Glove Service</p>
          <p className="text-xs text-slate-500 mt-1">Need immediate help? <a href="tel:9724661917" className="text-sky-700 font-semibold">(972) 466-1917</a></p>
        </div>

      </div>
    </div>
  );
}
