# Healthcare Inventory App - Design System Documentation

## Overview
This design system provides a comprehensive, production-ready UI/UX foundation for the Healthcare Inventory Management application. All components follow WCAG AA accessibility standards and are optimized for hospital staff use.

---

## Color System

### Primary Palette (Medical Blue)
- **Usage**: Primary actions, navigation, key interactive elements
- **Tokens**: 
  - `--primary`: Main brand color (HSL: 200 95% 42%)
  - `--primary-foreground`: Text on primary backgrounds (white)
  - `--primary-glow`: Hover/focus states (HSL: 200 100% 65%)
  - `--primary-muted`: Subtle backgrounds (HSL: 200 80% 85%)

### Secondary Palette (Healing Teal)
- **Usage**: Secondary actions, supporting elements
- **Tokens**:
  - `--secondary`: Secondary brand color (HSL: 180 60% 45%)
  - `--secondary-foreground`: Text on secondary backgrounds
  - `--secondary-muted`: Subtle secondary backgrounds

### Accent Palette (Interactive Teal)
- **Usage**: Interactive elements, hover states, focus indicators
- **Tokens**:
  - `--accent`: Interactive highlights (HSL: 165 70% 55%)
  - `--accent-foreground`: Text on accent backgrounds
  - `--accent-hover`: Darker accent for hover states

### Status Colors
- **Success**: `--success` (HSL: 142 76% 36%) - Positive actions, confirmations
- **Warning**: `--warning` (HSL: 38 92% 50%) - Caution, low stock alerts
- **Destructive**: `--destructive` (HSL: 0 84% 60%) - Critical items, errors, delete actions
- **Info**: `--info` (HSL: 200 95% 42%) - Informational messages

### Neutrals
- **Background**: White (light mode) / Dark gray (dark mode)
- **Foreground**: Dark gray (light mode) / Light gray (dark mode)
- **Muted**: Subtle backgrounds and disabled states
- **Border**: Consistent borders throughout UI

---

## Typography Scale

### Headings
- **H1**: `text-4xl font-bold tracking-tight` (36px) - Page titles
- **H2**: `text-3xl font-semibold tracking-tight` (30px) - Section headings
- **H3**: `text-2xl font-semibold tracking-tight` (24px) - Subsection headings
- **H4**: `text-xl font-semibold` (20px) - Card titles, group labels

### Body Text
- **Base**: `text-sm` (14px) - Default body text
- **Small**: `text-xs` (12px) - Captions, labels, metadata
- **Large**: `text-base` (16px) - Emphasis text

### Font Features
- Ligatures enabled (`"rlig" 1, "calt" 1`)
- Anti-aliasing: `-webkit-font-smoothing: antialiased`
- Optimized line heights for readability

---

## Spacing System

Consistent spacing using CSS variables:
- `--spacing-xs`: 0.25rem (4px) - Tight spacing
- `--spacing-sm`: 0.5rem (8px) - Small gaps
- `--spacing-md`: 1rem (16px) - Default spacing
- `--spacing-lg`: 1.5rem (24px) - Section spacing
- `--spacing-xl`: 2rem (32px) - Large gaps
- `--spacing-2xl`: 3rem (48px) - Major section breaks

---

## Border Radius

- `--radius-sm`: 0.25rem (4px) - Small elements
- `--radius`: 0.5rem (8px) - **Default** buttons, inputs
- `--radius-md`: 0.75rem (12px) - Cards, dialogs
- `--radius-lg`: 1rem (16px) - Large cards
- `--radius-xl`: 1.5rem (24px) - Hero sections
- `--radius-full`: 9999px - Pills, avatars

---

## Elevation & Shadows

Layered shadow system for depth perception:

- `--shadow-xs`: Subtle hover states
- `--shadow-sm`: Small elevated elements
- `--shadow-md`: Cards, dropdowns
- `--shadow-lg`: Dialogs, modals
- `--shadow-xl`: Major overlays
- `--shadow-2xl`: Maximum elevation
- `--shadow-elegant`: Primary color glow for special elements
- `--shadow-glow`: Interactive element highlights
- `--shadow-card`: Default card elevation

---

## Gradients

Pre-defined gradients for visual interest:

- `--gradient-primary`: Blue to teal (brand gradient)
- `--gradient-secondary`: Teal to accent (supporting gradient)
- `--gradient-hero`: Subtle background gradients
- `--gradient-success`: Success state gradient
- `--gradient-warning`: Warning state gradient
- `--gradient-danger`: Error state gradient
- `--gradient-glass`: Glass morphism effect

---

## Animation & Transitions

### Timing Functions
- `--transition-fast`: 150ms - Quick interactions (hover, active states)
- `--transition-base`: 250ms - **Default** for most transitions
- `--transition-slow`: 350ms - Complex animations
- `--transition-bounce`: 500ms - Playful micro-interactions

### Easing
- Default: `cubic-bezier(0.4, 0, 0.2, 1)` - Smooth, professional
- Bounce: `cubic-bezier(0.68, -0.55, 0.265, 1.55)` - Emphasis

---

## Component Patterns

### Buttons

**Variants:**
- `default`: Primary actions (gradient shadow on hover)
- `destructive`: Delete, critical actions
- `outline`: Secondary actions
- `secondary`: Supporting actions
- `ghost`: Tertiary, minimal actions
- `link`: Text links with underline
- `success`: Positive confirmations
- `gradient`: Hero CTAs with gradient background

**Sizes:**
- `sm`: Compact buttons (h-9, text-xs)
- `default`: Standard buttons (h-10)
- `lg`: Prominent buttons (h-11, text-base)
- `xl`: Hero buttons (h-12, text-lg)
- `icon`: Square icon buttons (10x10)

**Interactions:**
- Hover: Slight color change + increased shadow
- Active: `scale-95` for tactile feedback
- Focus: 2px ring with offset

### Cards

**Standard Card:**
- Border radius: `rounded-lg`
- Shadow: `var(--shadow-card)` → `var(--shadow-md)` on hover
- Transition: 200ms all properties
- Padding: Consistent with spacing system

**Interactive Card:**
- Add `.card-hover` class for lift effect on hover
- Use for clickable cards (navigation, selection)

### Forms

**Input Fields:**
- Border: `border-input`
- Focus: Ring with primary color
- Disabled: 50% opacity
- Error state: `border-destructive` + error message below

**Labels:**
- `text-sm font-medium` - Clear, readable
- Associated with input via `htmlFor`/`id`

### Badges

**Status Badges:**
- `default`: Neutral information
- `secondary`: Supporting info
- `destructive`: Critical/error states
- `outline`: Minimal badges
- Custom: `.bg-success`, `.bg-warning` for stock status

---

## Microinteractions Specification

### 1. Loading States
**Spinner:**
- Animation: `animate-spin`
- Size: 12x12 (h-12 w-12)
- Border: `border-b-2 border-primary`
- Duration: Continuous rotation

**Skeleton Loaders:**
- Class: `.skeleton` or component `<Skeleton />`
- Animation: `animate-pulse`
- Background: `bg-muted`
- Used for: Table rows, cards while loading

### 2. Hover Effects
**Card Hover:**
- Transform: `translateY(-2px)`
- Shadow: Elevation increase
- Duration: 300ms

**Button Hover:**
- Background: 90% opacity or darker shade
- Shadow: Increase shadow depth
- Duration: 200ms

**Link Hover:**
- Underline animation using `.link-underline`
- Scale-x from 0 to 1
- Origin: Left

### 3. Click/Active States
**Interactive Elements:**
- Active: `scale-95` for button press feedback
- Duration: 200ms
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`

### 4. Focus States
**All Interactive Elements:**
- Ring: 2px solid `ring-ring`
- Offset: 2px from element edge
- Applied via `:focus-visible`

### 5. Toast Notifications
**Timing:**
- Entry: Slide in from right (300ms)
- Display: 3-5 seconds
- Exit: Fade out (300ms)

**Variants:**
- Success: Green background
- Error: Red background (destructive)
- Info: Primary blue background
- Warning: Orange background

### 6. Dialog/Modal Transitions
**Entry:**
- Backdrop: Fade in (200ms)
- Content: Scale + fade (scale-in animation)

**Exit:**
- Backdrop: Fade out (200ms)
- Content: Scale out + fade

### 7. Table Interactions
**Row Hover:**
- Background: `hover:bg-muted/50`
- Transition: 150ms

**Sorting Indicators:**
- Icon rotation: 200ms
- Color change to primary

---

## Accessibility Guidelines

### Color Contrast
- **Text on background**: Minimum 4.5:1 (WCAG AA)
- **Large text**: Minimum 3:1
- **UI components**: Minimum 3:1 against background

### Keyboard Navigation
- All interactive elements focusable via Tab
- Focus indicators clearly visible (2px ring)
- Skip links available for screen readers
- Logical tab order maintained

### Screen Readers
- Semantic HTML used throughout (`<main>`, `<nav>`, `<section>`)
- ARIA labels on icon-only buttons
- Form labels properly associated with inputs
- Status messages announced via ARIA live regions

### Focus Management
- Focus trapped in modals/dialogs
- Focus returned to trigger element on close
- Focus indicators never removed via CSS

---

## Dark Mode

### Automatic Switching
- Theme toggle available in navigation
- Preference saved to localStorage
- System preference respected by default

### Color Adjustments
- All semantic tokens have dark mode variants
- Shadows adjusted for dark backgrounds
- Sufficient contrast maintained in both modes

---

## Responsive Design

### Breakpoints (Tailwind defaults)
- `sm`: 640px - Small tablets
- `md`: 768px - Tablets
- `lg`: 1024px - Laptops
- `xl`: 1280px - Desktops
- `2xl`: 1536px - Large desktops

### Mobile Optimizations
- Touch targets minimum 44x44px
- Simplified navigation for mobile
- Bottom sheet for mobile modals
- Larger text on small screens

---

## Implementation Notes

### CSS Variables
All design tokens are defined as CSS variables in `src/index.css`:
```css
:root {
  --primary: 200 95% 42%;
  --shadow-card: 0 2px 8px hsl(210 20% 70% / 0.08);
  /* ... etc */
}
```

### Tailwind Integration
Semantic tokens used via Tailwind classes:
```jsx
<div className="bg-primary text-primary-foreground">
```

### Component Customization
- All Shadcn components pre-configured with design tokens
- Use variants instead of custom classes
- Extend variants in component files for special cases

---

## Example Usages

### Dashboard KPI Card
```jsx
<Card className="card-hover">
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle className="text-muted-foreground">Total Items</CardTitle>
      <div className="p-2 bg-gradient-to-br from-primary to-primary-glow rounded-lg">
        <Package className="h-4 w-4 text-white" />
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold">1,234</div>
  </CardContent>
</Card>
```

### Primary Action Button
```jsx
<Button variant="default" size="lg" className="gap-2">
  <Plus className="h-4 w-4" />
  Add Item
</Button>
```

### Loading State
```jsx
{loading ? (
  <div className="flex flex-col items-center justify-center h-96 space-y-4">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    <p className="text-muted-foreground">Loading data...</p>
  </div>
) : (
  <DataTable />
)}
```

### Status Badge
```jsx
<Badge className="bg-success text-success-foreground">
  Normal Stock
</Badge>
```

---

## File Structure

```
src/
├── index.css                 # Design tokens, utility classes
├── components/
│   ├── ui/
│   │   ├── button.tsx       # Enhanced button variants
│   │   ├── card.tsx         # Card with hover effects
│   │   ├── badge.tsx        # Status badges
│   │   ├── skeleton.tsx     # Loading skeletons
│   │   └── ...              # Other UI components
│   └── Layout.tsx           # App layout with navigation
└── pages/
    ├── Dashboard.tsx        # KPI cards, quick actions
    ├── Inventory.tsx        # Table with search, filters
    ├── Predictions.tsx      # ML predictions display
    └── Auth.tsx             # Login/signup forms
```

---

## Handoff Checklist

### For Developers
- [ ] All CSS variables defined in `index.css`
- [ ] Component variants documented in this file
- [ ] Animation timings specified
- [ ] Focus states tested with keyboard
- [ ] Screen reader testing completed
- [ ] Color contrast verified (use browser tools)
- [ ] Dark mode tested
- [ ] Mobile responsive breakpoints tested

### For Designers
- [ ] All colors use HSL format
- [ ] Shadows defined as CSS variables
- [ ] Typography scale follows system
- [ ] Spacing uses consistent tokens
- [ ] Component states documented (hover, active, focus, disabled)
- [ ] Microinteractions specified with duration/easing

---

## Browser Support
- Chrome 90+ (recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

---

## Performance Considerations
- CSS variables reduce bundle size
- Tailwind purges unused styles
- Animations use GPU-accelerated properties (transform, opacity)
- No external font loading (system fonts used)

---

**Last Updated**: October 2025  
**Version**: 1.0.0  
**Maintained by**: Design System Team
