import React from 'react';
import {
  DoorOpen,
  Megaphone,
  Utensils,
  Activity,
  Bus,
  Eye,
  ShieldCheck,
  LucideIcon
} from 'lucide-react';

export interface DutyTypeBadgeConfig {
  typeKey: string;
  label: string;
  badgeClass: string;
  pillClass: string;
  avatarClass: string;
  cardBorderClass: string;
  icon: LucideIcon;
}

export function getDutyBadgeConfig(dutyString?: string, roleString?: string): DutyTypeBadgeConfig {
  const combined = `${dutyString || ''} ${roleString || ''}`.toLowerCase();

  // 1. Gate / Entrance / Arrival
  if (/gate|arrival|entrance|entry|entry point/i.test(combined)) {
    return {
      typeKey: 'gate',
      label: 'Gate & Arrival',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      pillClass: 'bg-emerald-500 text-slate-950',
      avatarClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      cardBorderClass: 'border-emerald-500/30 hover:border-emerald-500/60',
      icon: DoorOpen
    };
  }

  // 2. Assembly / Morning Briefing / Hall
  if (/assembly|briefing|hall|auditorium|flag/i.test(combined)) {
    return {
      typeKey: 'assembly',
      label: 'Assembly & Hall',
      badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      pillClass: 'bg-purple-500 text-slate-950',
      avatarClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      cardBorderClass: 'border-purple-500/30 hover:border-purple-500/60',
      icon: Megaphone
    };
  }

  // 3. Cafeteria / Canteen / Lunch / Recess / Dining
  if (/cafeteria|canteen|lunch|dining|recess|break/i.test(combined)) {
    return {
      typeKey: 'cafeteria',
      label: 'Cafeteria & Lunch',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      pillClass: 'bg-amber-500 text-slate-950',
      avatarClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      cardBorderClass: 'border-amber-500/30 hover:border-amber-500/60',
      icon: Utensils
    };
  }

  // 4. Playground / Sports Ground / Field / Courtyard
  if (/playground|ground|sport|field|court|quad/i.test(combined)) {
    return {
      typeKey: 'playground',
      label: 'Playground & Grounds',
      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      pillClass: 'bg-sky-500 text-slate-950',
      avatarClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      cardBorderClass: 'border-sky-500/30 hover:border-sky-500/60',
      icon: Activity
    };
  }

  // 5. Bus Bay / Dismissal / Departure
  if (/bus|dismissal|departure|transit|pickup|dropoff/i.test(combined)) {
    return {
      typeKey: 'bus',
      label: 'Bus Bay & Dismissal',
      badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      pillClass: 'bg-blue-500 text-slate-950',
      avatarClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      cardBorderClass: 'border-blue-500/30 hover:border-blue-500/60',
      icon: Bus
    };
  }

  // 6. Corridors / Hallway / Floors / Restrooms
  if (/corridor|hallway|floor|stair|washroom|restroom/i.test(combined)) {
    return {
      typeKey: 'corridor',
      label: 'Corridors & Halls',
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      pillClass: 'bg-rose-500 text-slate-950',
      avatarClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      cardBorderClass: 'border-rose-500/30 hover:border-rose-500/60',
      icon: Eye
    };
  }

  // Default: General Campus Supervision
  return {
    typeKey: 'general',
    label: 'Campus Duty',
    badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    pillClass: 'bg-teal-500 text-slate-950',
    avatarClass: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    cardBorderClass: 'border-teal-500/30 hover:border-teal-500/60',
    icon: ShieldCheck
  };
}
