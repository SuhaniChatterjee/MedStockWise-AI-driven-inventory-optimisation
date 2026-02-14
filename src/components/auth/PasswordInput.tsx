import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { calculatePasswordStrength, PasswordStrength } from "@/lib/passwordValidation";
import { cn } from "@/lib/utils";

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  showStrengthMeter?: boolean;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}

export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  showStrengthMeter = false,
  required = false,
  autoComplete = "current-password",
  placeholder
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const strength: PasswordStrength = showStrengthMeter ? calculatePasswordStrength(value) : { score: 0, level: 'weak', feedback: [] };

  const getStrengthColor = () => {
    if (strength.level === 'strong') return 'bg-success';
    if (strength.level === 'medium') return 'bg-warning';
    return 'bg-destructive';
  };

  const getStrengthTextColor = () => {
    if (strength.level === 'strong') return 'text-success';
    if (strength.level === 'medium') return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="pr-10"
          aria-describedby={showStrengthMeter ? `${id}-strength` : undefined}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {showStrengthMeter && value && (
        <div id={`${id}-strength`} className="space-y-2" aria-live="polite">
          <div className="flex items-center gap-2">
            <Progress value={strength.score} className="h-2 flex-1">
              <div
                className={cn("h-full transition-all", getStrengthColor())}
                style={{ width: `${strength.score}%` }}
              />
            </Progress>
            <span className={cn("text-sm font-medium capitalize", getStrengthTextColor())}>
              {strength.level}
            </span>
          </div>
          
          {strength.feedback.length > 0 && (
            <div className="flex gap-2 text-sm">
              {strength.level === 'strong' ? (
                <ShieldCheck className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              )}
              <ul className="space-y-1">
                {strength.feedback.map((fb, idx) => (
                  <li key={idx} className="text-muted-foreground">{fb}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
