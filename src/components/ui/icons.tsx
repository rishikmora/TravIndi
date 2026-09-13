import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function icon(paths: ReactNode, displayName: string) {
  const Icon = ({ size = 20, strokeWidth = 1.6, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.35-4.35" />
  </>,
  'SearchIcon',
);
export const UserIcon = icon(
  <>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
  </>,
  'UserIcon',
);
export const MenuIcon = icon(<path d="M4 8.5h16M4 15.5h16" />, 'MenuIcon');
export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />, 'CloseIcon');
export const ArrowRightIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />, 'ArrowRightIcon');
export const ArrowLeftIcon = icon(<path d="M19 12H5M11 6l-6 6 6 6" />, 'ArrowLeftIcon');
export const ArrowUpRightIcon = icon(<path d="M7 17 17 7M8 7h9v9" />, 'ArrowUpRightIcon');
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />, 'ChevronDownIcon');
export const ChevronRightIcon = icon(<path d="m9 6 6 6-6 6" />, 'ChevronRightIcon');
export const ChevronLeftIcon = icon(<path d="m15 6-6 6 6 6" />, 'ChevronLeftIcon');
export const SoundOnIcon = icon(
  <>
    <path d="M4 10v4h3l5 4V6L7 10H4Z" />
    <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />
  </>,
  'SoundOnIcon',
);
export const SoundOffIcon = icon(
  <>
    <path d="M4 10v4h3l5 4V6L7 10H4Z" />
    <path d="m16 10 4 4m0-4-4 4" />
  </>,
  'SoundOffIcon',
);
export const SlidersIcon = icon(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
  'SlidersIcon',
);
export const MapPinIcon = icon(
  <>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </>,
  'MapPinIcon',
);
export const CalendarIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </>,
  'CalendarIcon',
);
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.5 2" />
  </>,
  'ClockIcon',
);
export const CompassIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </>,
  'CompassIcon',
);
export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, 'CheckIcon');
export const CameraIcon = icon(
  <>
    <path d="M4 8h3l2-2.5h6L17 8h3v11H4Z" />
    <circle cx="12" cy="13" r="3.5" />
  </>,
  'CameraIcon',
);
export const RouteIcon = icon(
  <>
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
  </>,
  'RouteIcon',
);
export const SparkleIcon = icon(
  <path d="M12 4c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6Z" />,
  'SparkleIcon',
);
export const LayersIcon = icon(
  <>
    <path d="m12 4 8 4.5-8 4.5-8-4.5L12 4Z" />
    <path d="m4 13 8 4.5 8-4.5" />
  </>,
  'LayersIcon',
);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, 'PlusIcon');
export const MinusIcon = icon(<path d="M5 12h14" />, 'MinusIcon');
export const ExpandIcon = icon(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />, 'ExpandIcon');

/* Product icons */
export const HomeIcon = icon(<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />, 'HomeIcon');
export const SuitcaseIcon = icon(
  <>
    <rect x="3.5" y="7" width="17" height="13" rx="2" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" />
  </>,
  'SuitcaseIcon',
);
export const MapIcon = icon(<path d="m9 4-5.5 2v14L9 18l6 2 5.5-2V4L15 6zM9 4v14M15 6v14" />, 'MapIcon');
export const MessageIcon = icon(<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" />, 'MessageIcon');
export const ShieldIcon = icon(<path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.9 7 9 4.1-1.1 7-4.7 7-9V6z" />, 'ShieldIcon');
export const ShieldCheckIcon = icon(
  <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.9 7 9 4.1-1.1 7-4.7 7-9V6zM9 12l2.2 2.2L15.5 10" />,
  'ShieldCheckIcon',
);
export const BellIcon = icon(<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0" />, 'BellIcon');
export const AlertIcon = icon(<path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.1" />, 'AlertIcon');
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8v.1" />
  </>,
  'InfoIcon',
);
export const WifiOffIcon = icon(
  <path d="M3 3l18 18M8.5 16.3a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 4.2-2.3M12.9 9.5A10 10 0 0 1 19 12.6M12 19.5v.1" />,
  'WifiOffIcon',
);
export const RefreshIcon = icon(<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />, 'RefreshIcon');
export const SettingsIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </>,
  'SettingsIcon',
);
export const LogOutIcon = icon(<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />, 'LogOutIcon');
export const PhoneIcon = icon(
  <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" />,
  'PhoneIcon',
);
export const SendIcon = icon(<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />, 'SendIcon');
export const UsersIcon = icon(
  <>
    <circle cx="9" cy="9" r="3.2" />
    <path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6M16 5.8a3 3 0 0 1 0 6M17.5 14.6c1.6.6 2.6 2 3 4.4" />
  </>,
  'UsersIcon',
);
export const TicketIcon = icon(
  <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4zM14 6.5v1.5M14 11v2M14 16v1.5" />,
  'TicketIcon',
);
export const HistoryIcon = icon(<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4.5v4h4M12 8v4.5l3 2" />, 'HistoryIcon');
export const StarIcon = icon(<path d="m12 4 2.5 5.2 5.5.7-4 3.9 1 5.5L12 16.7l-5 2.6 1-5.5-4-3.9 5.5-.7z" />, 'StarIcon');
export const BadgeCheckIcon = icon(
  <path d="M12 3.5l2.2 1.6 2.7-.1.9 2.6 2.2 1.6-.8 2.6.8 2.6-2.2 1.6-.9 2.6-2.7-.1L12 20.5l-2.2-1.6-2.7.1-.9-2.6-2.2-1.6.8-2.6-.8-2.6 2.2-1.6.9-2.6 2.7.1zM9 12l2.2 2.2L15.5 10" />,
  'BadgeCheckIcon',
);
export const LockIcon = icon(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>,
  'LockIcon',
);
export const EyeIcon = icon(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  'EyeIcon',
);
export const PauseIcon = icon(<path d="M9 6v12M15 6v12" />, 'PauseIcon');
export const PlayIcon = icon(<path d="M8 5.5v13l10-6.5z" />, 'PlayIcon');
export const StopIcon = icon(<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />, 'StopIcon');
export const TrashIcon = icon(<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />, 'TrashIcon');
export const EditIcon = icon(<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />, 'EditIcon');
export const WalkIcon = icon(
  <>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="m9.5 21 2-6 2.5 2.5V21M8 12l1.8-4.2L13 7l2 3.5 3 1.5M11.5 15l-1-4" />
  </>,
  'WalkIcon',
);
export const AccessibilityIcon = icon(
  <>
    <circle cx="12" cy="4.5" r="1.8" />
    <path d="M5 8.5h14M12 8.5v5M9 21l3-7.5 3 7.5" />
  </>,
  'AccessibilityIcon',
);
export const FilterIcon = icon(<path d="M4 6h16M7 12h10M10 18h4" />, 'FilterIcon');
export const GlobeIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" />
  </>,
  'GlobeIcon',
);
export const LocateIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
  </>,
  'LocateIcon',
);
export const ChartIcon = icon(<path d="M5 20v-7M11 20V5M17 20V10M3 20h18" />, 'ChartIcon');
export const FlagIcon = icon(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />, 'FlagIcon');
export const BedIcon = icon(
  <>
    <path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6" />
    <circle cx="7" cy="11.5" r="1.8" />
  </>,
  'BedIcon',
);
export const CarIcon = icon(
  <>
    <path d="M4.5 16.5V12l2-5h11l2 5v4.5M4.5 12h15M3.5 16.5h17" />
    <circle cx="8" cy="16.5" r="1.7" />
    <circle cx="16" cy="16.5" r="1.7" />
  </>,
  'CarIcon',
);
export const DotsIcon = icon(
  <>
    <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </>,
  'DotsIcon',
);
