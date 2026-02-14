import { z } from 'zod';

const COMMON_PASSWORDS = [
  'password', '123456', 'qwerty', 'hospital', 'admin', 
  '12345678', 'password123', 'admin123', 'welcome', 
  'letmein', 'monkey', 'dragon', 'master', 'password1'
];

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .refine((val) => /[A-Z]/.test(val), 'Must include at least one uppercase letter')
  .refine((val) => /[a-z]/.test(val), 'Must include at least one lowercase letter')
  .refine((val) => /\d/.test(val), 'Must include at least one digit')
  .refine((val) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val), 'Must include at least one special character')
  .refine(
    (val) => !COMMON_PASSWORDS.includes(val.toLowerCase()),
    'Password is too common. Choose a unique password'
  );

export interface PasswordStrength {
  score: number; // 0-100
  level: 'weak' | 'medium' | 'strong';
  feedback: string[];
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, level: 'weak', feedback: ['Enter a password'] };
  }

  let score = 0;
  const feedback: string[] = [];

  // Length scoring (max 30 points)
  if (password.length >= 12) {
    score += 30;
  } else if (password.length >= 8) {
    score += 15;
    feedback.push('Use at least 12 characters for better security');
  } else {
    feedback.push('Password too short - use at least 12 characters');
  }

  // Character variety (max 40 points)
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (hasUpper) score += 10;
  else feedback.push('Add uppercase letters');
  
  if (hasLower) score += 10;
  else feedback.push('Add lowercase letters');
  
  if (hasDigit) score += 10;
  else feedback.push('Add numbers');
  
  if (hasSpecial) score += 10;
  else feedback.push('Add special characters (!@#$%^&*)');

  // Complexity bonus (max 30 points)
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= 10) score += 30;
  else if (uniqueChars >= 6) score += 15;
  else feedback.push('Use more unique characters');

  // Common password penalty
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    score = Math.min(score, 20);
    feedback.push('Avoid common passwords');
  }

  // Determine level
  let level: 'weak' | 'medium' | 'strong';
  if (score >= 70) level = 'strong';
  else if (score >= 40) level = 'medium';
  else level = 'weak';

  return { score, level, feedback: feedback.length ? feedback : ['Strong password!'] };
}

export function validatePasswordMatch(password: string, confirmPassword: string): boolean {
  return password === confirmPassword && password.length > 0;
}
