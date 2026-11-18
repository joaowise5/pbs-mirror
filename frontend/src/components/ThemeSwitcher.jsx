import { Icon } from './Icons.jsx';

const OPTIONS = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

export default function ThemeSwitcher({ preference, onChange, onBrand = false }) {
  return (
    <div className={`theme-switcher ${onBrand ? 'theme-switcher--on-brand' : ''}`} role="group" aria-label="Color theme">
      {OPTIONS.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          className="theme-switcher__choice"
          aria-label={`${label} theme`}
          aria-pressed={preference === value}
          title={`${label} theme`}
          onClick={() => onChange(value)}
        >
          <Icon name={icon} />
          <span className="theme-switcher__label">{label}</span>
        </button>
      ))}
    </div>
  );
}
