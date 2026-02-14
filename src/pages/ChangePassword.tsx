import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PasswordInput from "@/components/auth/PasswordInput";
import { passwordSchema, validatePasswordMatch } from "@/lib/passwordValidation";
import { ArrowLeft } from "lucide-react";

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; new?: string; confirm?: string }>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  const validateForm = (): boolean => {
    const newErrors: { current?: string; new?: string; confirm?: string } = {};

    if (!currentPassword) {
      newErrors.current = "Current password is required";
    }

    try {
      passwordSchema.parse(newPassword);
    } catch (err: any) {
      newErrors.new = err.errors[0]?.message || "Invalid password";
    }

    if (!validatePasswordMatch(newPassword, confirmPassword)) {
      newErrors.confirm = "Passwords do not match";
    }

    if (currentPassword === newPassword) {
      newErrors.new = "New password must be different from current password";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    // First verify current password by attempting to sign in
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      toast({
        title: "Error",
        description: "User not found",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      setErrors({ current: "Current password is incorrect" });
      setIsLoading(false);
      return;
    }

    // Check password history via edge function (if implemented)
    // For now, we'll just update the password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      toast({
        title: "Error",
        description: updateError.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Your password has been changed successfully",
      });
      navigate("/");
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <PasswordInput
                id="currentPassword"
                label="Current Password"
                value={currentPassword}
                onChange={setCurrentPassword}
                required
                autoComplete="current-password"
              />
              {errors.current && (
                <p className="text-sm text-destructive mt-1">{errors.current}</p>
              )}
            </div>

            <div>
              <PasswordInput
                id="newPassword"
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                showStrengthMeter
                required
                autoComplete="new-password"
              />
              {errors.new && (
                <p className="text-sm text-destructive mt-1">{errors.new}</p>
              )}
            </div>

            <div>
              <PasswordInput
                id="confirmPassword"
                label="Confirm New Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                autoComplete="new-password"
              />
              {errors.confirm && (
                <p className="text-sm text-destructive mt-1">{errors.confirm}</p>
              )}
            </div>

            <div className="space-y-2">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Changing..." : "Change Password"}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
