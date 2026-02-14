# Microinteractions Specification

## Loading States
- **Spinner**: Dual-ring animation with ping effect (h-16 w-16, border-b-4)
- **Skeleton**: Pulse animation on muted background
- **Duration**: Continuous until data loads

## Hover Effects
- **Cards**: translateY(-2px) + shadow increase (300ms)
- **Buttons**: Background opacity 90% + shadow depth (200ms)
- **Quick Actions**: -translate-y-1 + border color + shadow (300ms)

## Click States
- **All Buttons**: scale-95 active state (200ms)
- **Interactive Elements**: scale-[1.02] hover, scale-[0.98] active

## Animations
- **Page Entry**: fade-in duration-500
- **KPI Cards**: Staggered animation-delay (100ms increments)
- **Numbers**: slide-in-from-bottom-4 duration-700

## Transitions
- Fast: 150ms (hover states)
- Base: 250ms (default)
- Slow: 350ms (complex animations)

## Focus States
- 2px ring with offset on all interactive elements
- Primary color ring (--ring)
