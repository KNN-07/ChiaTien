import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon, type FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import {
  faBagShopping,
  faBeerMugEmpty,
  faBowlFood,
  faBox,
  faCar,
  faCartShopping,
  faCity,
  faFileInvoiceDollar,
  faGasPump,
  faGift,
  faGlobe,
  faHotel,
  faKitMedical,
  faMountainSun,
  faMugHot,
  faPersonSwimming,
  faPlane,
  faSnowflake,
  faSuitcaseRolling,
  faTaxi,
  faTent,
  faTicket,
  faToriiGate,
  faTreeCity,
  faUmbrellaBeach,
  faWater,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from './cn';

export function Icon({ className, ...props }: FontAwesomeIconProps) {
  return <FontAwesomeIcon fixedWidth {...props} className={cn('shrink-0', className)} />;
}

export const CATEGORY_ICONS: Record<string, IconDefinition> = {
  food: faBowlFood,
  drinks: faBeerMugEmpty,
  coffee: faMugHot,
  lodging: faHotel,
  transport: faTaxi,
  flight: faPlane,
  fuel: faGasPump,
  tickets: faTicket,
  activities: faPersonSwimming,
  shopping: faBagShopping,
  groceries: faCartShopping,
  gifts: faGift,
  health: faKitMedical,
  fees: faFileInvoiceDollar,
  other: faBox,
};

export const categoryIcon = (id: string) => CATEGORY_ICONS[id] ?? faBox;

export const TRIP_ICONS: Record<string, IconDefinition> = {
  suitcase: faSuitcaseRolling,
  beach: faUmbrellaBeach,
  mountain: faMountainSun,
  camp: faTent,
  city: faCity,
  town: faTreeCity,
  plane: faPlane,
  car: faCar,
  temple: faToriiGate,
  sea: faWater,
  snow: faSnowflake,
  world: faGlobe,
  food: faBowlFood,
};

/** Trips created before the icon redesign stored an emoji. */
const LEGACY: Record<string, string> = {
  '🏝️': 'beach',
  '🏖️': 'beach',
  '🏔️': 'mountain',
  '🏕️': 'camp',
  '🏙️': 'city',
  '✈️': 'plane',
  '🚗': 'car',
  '🍜': 'food',
  '⛩️': 'temple',
  '🗼': 'city',
  '🎿': 'snow',
  '🎉': 'world',
};

export const tripIcon = (key?: string) => TRIP_ICONS[key ?? ''] ?? TRIP_ICONS[LEGACY[key ?? ''] ?? ''] ?? faSuitcaseRolling;

export function TripIcon({ icon, className }: { icon?: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-foreground', className)}>
      <Icon icon={tripIcon(icon)} />
    </span>
  );
}

export function CategoryIcon({ id, income, className }: { id: string; income?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground',
        income && 'text-positive',
        className,
      )}
    >
      <Icon icon={income ? CATEGORY_ICONS.gifts : categoryIcon(id)} className="text-sm" />
    </span>
  );
}
