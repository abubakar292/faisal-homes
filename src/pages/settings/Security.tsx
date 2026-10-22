import React, { useState } from 'react';
import { Shield, Lock, Clock, AlertTriangle, KeyRound, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import { useOpening } from '../../contexts/OpeningContext';

const Security: React.FC = () => {
  const { lockNow, autoLockMinutes, setAutoLockMinutes, changePin } = useOpening();

  // Change PIN form state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isChanging, setIsChanging] = useState(false);

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!/^\d{4}$/.test(currentPin)) {
      toast.error('Current PIN must be exactly 4 digits');
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      toast.error('New PIN must be exactly 4 digits');
      return;
    }

    if (newPin !== confirmPin) {
      toast.error('New PIN and confirmation do not match');
      return;
    }

    setIsChanging(true);
    const res = await changePin(currentPin, newPin, confirmPin);
    setIsChanging(false);

    if (res.ok) {
      toast.success('Opening password changed successfully!');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } else {
      toast.error(res.error || 'Failed to change opening password');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      <PageHeader
        title="Security Settings"
        subtitle="Opening password gate, idle lock duration, and device access control"
        icon={<Shield size={20} />}
      />

      {/* Change Opening Password Card */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-blue-50 text-[#1a3c6e] rounded-lg">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Change Opening Password</h2>
            <p className="text-xs text-slate-500">
              Update the 4-digit PIN required to unlock this application on any device.
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePin} className="space-y-4 max-w-md">
          <FormField label="Current Opening PIN" required>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4 digits"
              className="input-field tracking-widest text-center font-mono text-lg"
              required
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="New 4-Digit PIN" required>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4 digits"
                className="input-field tracking-widest text-center font-mono text-lg"
                required
              />
            </FormField>

            <FormField label="Confirm New PIN" required>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4 digits"
                className="input-field tracking-widest text-center font-mono text-lg"
                required
              />
            </FormField>
          </div>

          <button
            type="submit"
            disabled={isChanging || !currentPin || !newPin || !confirmPin}
            className="btn btn-primary flex items-center gap-2"
          >
            {isChanging ? 'Updating...' : (
              <>
                <Check size={16} />
                Save New PIN
              </>
            )}
          </button>
        </form>
      </div>

      {/* Device Lock & Auto-Lock Card */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
            <Clock size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Session & Auto-Lock</h2>
            <p className="text-xs text-slate-500">
              Control when this browser session locks automatically after a period of inactivity.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Auto-Lock Inactivity Period
            </label>
            <select
              value={autoLockMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setAutoLockMinutes(val);
                toast.success(`Auto-lock set to ${val === 0 ? 'Off' : val + ' minutes'}`);
              }}
              className="input-field bg-white"
            >
              <option value={0}>Off (Never auto-lock)</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes (Default)</option>
              <option value={60}>60 minutes (1 hour)</option>
            </select>
            <p className="text-xs text-slate-400 mt-1.5">
              Saved per device in this browser.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={lockNow}
              className="btn btn-secondary flex items-center gap-2 w-full sm:w-auto"
            >
              <Lock size={16} />
              Lock App Now
            </button>
            <p className="text-xs text-slate-400 mt-1.5">
              Instantly clears session token and displays the opening PIN gate.
            </p>
          </div>
        </div>
      </div>

      {/* Recovery Instructions Card */}
      <div className="card bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 text-amber-700 rounded-lg mt-0.5">
            <AlertTriangle size={20} />
          </div>
          <div className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
            <h3 className="text-sm font-bold text-slate-900">Recovery Procedure</h3>
            <p>
              There is no email reset mechanism for the Opening Password.
            </p>
            <p>
              To reset a forgotten PIN, the project administrator or database owner must delete the document:
            </p>
            <code className="block bg-white p-2 rounded border border-slate-200 font-mono text-slate-800 font-bold">
              app_security/opening_pin
            </code>
            <p>
              in the Firebase Firestore console. After deleting that document, refreshing the application will prompt the initial "Set your Opening Password" setup screen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Security;
