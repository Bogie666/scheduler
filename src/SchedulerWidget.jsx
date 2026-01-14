import React, { useState } from 'react';

const services = {
  hvac: {
    name: 'Heating & Cooling',
    icon: '❄️',
    color: '#0077B6',
    issues: [
      { id: 'ac-not-cooling', label: 'AC Not Cooling' },
      { id: 'heater-not-working', label: 'Heater Not Working' },
      { id: 'hvac-maintenance', label: 'Maintenance / Tune-Up' },
      { id: 'new-system', label: 'New System Estimate' },
      { id: 'strange-noises', label: 'Strange Noises' },
      { id: 'hvac-other', label: 'Other HVAC Issue' },
    ]
  },
  plumbing: {
    name: 'Plumbing',
    icon: '🔧',
    color: '#0096C7',
    issues: [
      { id: 'leak', label: 'Leak / Dripping' },
      { id: 'clogged-drain', label: 'Clogged Drain' },
      { id: 'water-heater', label: 'Water Heater Issue' },
      { id: 'no-hot-water', label: 'No Hot Water' },
      { id: 'toilet-issue', label: 'Toilet Problem' },
      { id: 'plumbing-other', label: 'Other Plumbing Issue' },
    ]
  },
  electrical: {
    name: 'Electrical',
    icon: '⚡',
    color: '#F77F00',
    issues: [
      { id: 'outlet-not-working', label: 'Outlet Not Working' },
      { id: 'breaker-tripping', label: 'Breaker Keeps Tripping' },
      { id: 'lighting-issue', label: 'Lighting Issue' },
      { id: 'panel-upgrade', label: 'Panel Upgrade' },
      { id: 'ceiling-fan', label: 'Ceiling Fan Install' },
      { id: 'electrical-other', label: 'Other Electrical Issue' },
    ]
  }
};

const timeSlots = [
  { id: 'morning', label: 'Morning', time: '8am - 12pm' },
  { id: 'afternoon', label: 'Afternoon', time: '12pm - 5pm' },
  { id: 'first-available', label: 'First Available', time: 'ASAP' },
];

export default function SchedulerWidget({ onClose, apiEndpoint }) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    serviceType: '',
    issue: '',
    issueDetails: '',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    zip: '',
    preferredDate: '',
    preferredTime: '',
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const response = await fetch(apiEndpoint || '/api/lex-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit booking request');
      }
      
      setSubmitSuccess(true);
      setStep(5);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedService = services[formData.serviceType];

  // Generate next 14 days for date selection
  const getAvailableDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      if (date.getDay() !== 0) { // Skip Sundays
        dates.push(date);
      }
    }
    return dates;
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="lex-scheduler-overlay">
      <div className="lex-scheduler-modal">
        {/* Header */}
        <div className="lex-scheduler-header">
          <div className="lex-header-content">
            <img src="/Lex-logo.png" alt="LEX Air Conditioning" className="lex-header-logo" />
          </div>
          {onClose && (
            <button className="lex-close-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="lex-progress-bar">
          {[1, 2, 3, 4].map(i => (
            <div 
              key={i} 
              className={`lex-progress-step ${step >= i ? 'active' : ''} ${step > i ? 'complete' : ''}`}
            >
              <span className="lex-step-number">{step > i ? '✓' : i}</span>
              <span className="lex-step-label">
                {i === 1 && 'Service'}
                {i === 2 && 'Details'}
                {i === 3 && 'Contact'}
                {i === 4 && 'Schedule'}
              </span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="lex-scheduler-content">
          {/* Step 1: Service Selection */}
          {step === 1 && (
            <div className="lex-step-content">
              <h3>What do you need help with?</h3>
              <div className="lex-service-grid">
                {Object.entries(services).map(([key, service]) => (
                  <button
                    key={key}
                    className={`lex-service-card ${formData.serviceType === key ? 'selected' : ''}`}
                    onClick={() => {
                      updateField('serviceType', key);
                      updateField('issue', '');
                    }}
                    style={{ '--service-color': service.color }}
                  >
                    <span className="lex-service-icon">{service.icon}</span>
                    <span className="lex-service-name">{service.name}</span>
                  </button>
                ))}
              </div>

              {selectedService && (
                <div className="lex-issue-selection">
                  <h4>What's the issue?</h4>
                  <div className="lex-issue-grid">
                    {selectedService.issues.map(issue => (
                      <button
                        key={issue.id}
                        className={`lex-issue-btn ${formData.issue === issue.id ? 'selected' : ''}`}
                        onClick={() => updateField('issue', issue.id)}
                        style={{ '--service-color': selectedService.color }}
                      >
                        {issue.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="lex-step-actions">
                <button 
                  className="lex-btn-primary" 
                  disabled={!formData.serviceType || !formData.issue}
                  onClick={nextStep}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Issue Details */}
          {step === 2 && (
            <div className="lex-step-content">
              <h3>Tell us more about the problem</h3>
              <p className="lex-subtitle">
                {selectedService?.name} → {selectedService?.issues.find(i => i.id === formData.issue)?.label}
              </p>
              
              <div className="lex-form-group">
                <label htmlFor="issueDetails">Additional details (optional)</label>
                <textarea
                  id="issueDetails"
                  rows={4}
                  placeholder="Describe what's happening, any error codes, how long it's been going on, etc."
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

          {/* Step 3: Contact Info */}
          {step === 3 && (
            <div className="lex-step-content">
              <h3>Your contact information</h3>
              
              <div className="lex-form-row">
                <div className="lex-form-group">
                  <label htmlFor="firstName">First Name *</label>
                  <input
                    id="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                  />
                </div>
                <div className="lex-form-group">
                  <label htmlFor="lastName">Last Name *</label>
                  <input
                    id="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                  />
                </div>
              </div>

              <div className="lex-form-row">
                <div className="lex-form-group">
                  <label htmlFor="phone">Phone *</label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    placeholder="(214) 555-1234"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                  />
                </div>
                <div className="lex-form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@email.com"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                </div>
              </div>

              <div className="lex-form-group">
                <label htmlFor="address">Service Address *</label>
                <input
                  id="address"
                  type="text"
                  required
                  placeholder="123 Main St"
                  value={formData.address}
                  onChange={(e) => updateField('address', e.target.value)}
                />
              </div>

              <div className="lex-form-row">
                <div className="lex-form-group">
                  <label htmlFor="city">City *</label>
                  <input
                    id="city"
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                  />
                </div>
                <div className="lex-form-group lex-form-group-small">
                  <label htmlFor="zip">ZIP *</label>
                  <input
                    id="zip"
                    type="text"
                    required
                    placeholder="75024"
                    value={formData.zip}
                    onChange={(e) => updateField('zip', e.target.value)}
                  />
                </div>
              </div>

              <div className="lex-step-actions">
                <button className="lex-btn-secondary" onClick={prevStep}>Back</button>
                <button 
                  className="lex-btn-primary" 
                  disabled={!formData.firstName || !formData.lastName || !formData.phone || !formData.address || !formData.city || !formData.zip}
                  onClick={nextStep}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Schedule */}
          {step === 4 && (
            <div className="lex-step-content">
              <h3>When works best for you?</h3>
              
              <div className="lex-form-group">
                <label>Preferred Date</label>
                <div className="lex-date-grid">
                  {getAvailableDates().map(date => (
                    <button
                      key={date.toISOString()}
                      className={`lex-date-btn ${formData.preferredDate === date.toISOString().split('T')[0] ? 'selected' : ''}`}
                      onClick={() => updateField('preferredDate', date.toISOString().split('T')[0])}
                    >
                      {formatDate(date)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lex-form-group">
                <label>Preferred Time</label>
                <div className="lex-time-grid">
                  {timeSlots.map(slot => (
                    <button
                      key={slot.id}
                      className={`lex-time-btn ${formData.preferredTime === slot.id ? 'selected' : ''}`}
                      onClick={() => updateField('preferredTime', slot.id)}
                    >
                      <span className="lex-time-label">{slot.label}</span>
                      <span className="lex-time-range">{slot.time}</span>
                    </button>
                  ))}
                </div>
              </div>

              {submitError && (
                <div className="lex-error-message">
                  {submitError}. Please try again or call us directly.
                </div>
              )}

              <div className="lex-step-actions">
                <button className="lex-btn-secondary" onClick={prevStep}>Back</button>
                <button 
                  className="lex-btn-primary" 
                  disabled={!formData.preferredDate || !formData.preferredTime || isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? 'Submitting...' : 'Request Appointment'}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Confirmation */}
          {step === 5 && submitSuccess && (
            <div className="lex-step-content lex-confirmation">
              <div className="lex-success-icon">✓</div>
              <h3>Request Received!</h3>
              <p>
                Thanks, {formData.firstName}! We've received your {selectedService?.name.toLowerCase()} service request.
              </p>
              <p className="lex-confirmation-details">
                A member of our team will call you shortly to confirm your appointment.
              </p>
              <div className="lex-confirmation-summary">
                <div className="lex-summary-row">
                  <span>Service:</span>
                  <span>{selectedService?.name}</span>
                </div>
                <div className="lex-summary-row">
                  <span>Issue:</span>
                  <span>{selectedService?.issues.find(i => i.id === formData.issue)?.label}</span>
                </div>
                <div className="lex-summary-row">
                  <span>Preferred Date:</span>
                  <span>{new Date(formData.preferredDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                </div>
                <div className="lex-summary-row">
                  <span>Preferred Time:</span>
                  <span>{timeSlots.find(t => t.id === formData.preferredTime)?.label}</span>
                </div>
              </div>
              <div className="lex-emergency-note">
                <strong>Emergency?</strong> Call us now at <a href="tel:9724661917">(972) 466-1917</a>
              </div>
              {onClose && (
                <button className="lex-btn-primary" onClick={onClose}>
                  Close
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="lex-scheduler-footer">
          <p>The Gold Standard of White Glove Service</p>
          <p>Need immediate help? <a href="tel:9724661917">(972) 466-1917</a></p>
        </div>
      </div>
    </div>
  );
}
