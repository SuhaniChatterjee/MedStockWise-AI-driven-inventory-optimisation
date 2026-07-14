import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Activity, Building2, KeyRound, CheckCircle2, Loader2 } from "lucide-react";
import PasswordInput from "@/components/auth/PasswordInput";
import { passwordSchema, validatePasswordMatch } from "@/lib/passwordValidation";
import { ZodError } from "zod";

type SignupMode = "create" | "join";

const REGIONS = [
  { value: "temperate", label: "Temperate (cold/flu-season dominant)" },
  { value: "tropical", label: "Tropical (monsoon / vector-borne illness)" },
  { value: "subtropical", label: "Subtropical (mixed seasonal pattern)" },
];

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string; onboarding?: string }>({});

  // Onboarding
  const [signupMode, setSignupMode] = useState<SignupMode>("create");
  const [hospitalName, setHospitalName] = useState("");
  const [region, setRegion] = useState("temperate");
  const [inviteCode, setInviteCode] = useState("");

  const debouncedInviteCode = useDebouncedValue(inviteCode.trim(), 500);
  const [inviteCheck, setInviteCheck] = useState<
    { status: "idle" | "checking" } | { status: "valid"; hospitalName: string } | { status: "invalid" }
  >({ status: "idle" });

  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  // Live-validate the invite code so the user sees which hospital they're
  // joining (or that the code is wrong) before committing to signup.
  useEffect(() => {
    if (signupMode !== "join" || debouncedInviteCode.length === 0) {
      setInviteCheck({ status: "idle" });
      return;
    }
    let cancelled = false;
    setInviteCheck({ status: "checking" });
    supabase.functions
      .invoke("validate-invite-code", { body: { invite_code: debouncedInviteCode } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.valid) {
          setInviteCheck({ status: "invalid" });
        } else {
          setInviteCheck({ status: "valid", hospitalName: data.hospital_name });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedInviteCode, signupMode]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Signed in successfully" });
      navigate("/");
    }

    setIsLoading(false);
  };

  const validateSignupForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!email.includes("@")) {
      newErrors.email = "Please enter a valid email address";
    }

    try {
      passwordSchema.parse(password);
    } catch (err) {
      newErrors.password = err instanceof ZodError ? err.issues[0]?.message : "Invalid password";
    }

    if (!validatePasswordMatch(password, confirmPassword)) {
      newErrors.confirm = "Passwords do not match";
    }

    if (signupMode === "create") {
      if (hospitalName.trim().length < 2) {
        newErrors.onboarding = "Enter a hospital name";
      }
    } else {
      if (inviteCheck.status !== "valid") {
        newErrors.onboarding = "Enter a valid invite code";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateSignupForm()) return;

    setIsLoading(true);

    const onboarding =
      signupMode === "create"
        ? ({ mode: "create", hospitalName: hospitalName.trim(), region } as const)
        : ({ mode: "join", inviteCode: inviteCode.trim() } as const);

    const { error } = await signUp(email, password, fullName, onboarding);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Success",
        description:
          signupMode === "create"
            ? "Hospital created! Check your email to verify your account, then sign in as its admin."
            : "Account created! Check your email to verify your account.",
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-primary to-secondary rounded-xl">
              <Activity className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">MedStock Wise</CardTitle>
          <CardDescription>Hospital inventory management</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@hospital.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <PasswordInput
                  id="password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  required
                  autoComplete="current-password"
                />
                <div className="flex justify-end">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                {/* Create vs Join toggle */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSignupMode("create")}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                      signupMode === "create"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Building2 className="h-5 w-5" />
                    Create a hospital
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignupMode("join")}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                      signupMode === "join"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <KeyRound className="h-5 w-5" />
                    Join with a code
                  </button>
                </div>

                {signupMode === "create" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="hospital-name">Hospital Name</Label>
                      <Input
                        id="hospital-name"
                        placeholder="Mercy General Hospital"
                        value={hospitalName}
                        onChange={(e) => setHospitalName(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        You'll be this hospital's first admin.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="region">Climate region</Label>
                      <Select value={region} onValueChange={setRegion}>
                        <SelectTrigger id="region">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REGIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Used to tailor seasonal demand estimates.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="invite-code">Invite Code</Label>
                    <Input
                      id="invite-code"
                      placeholder="Paste the code your admin gave you"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      required
                    />
                    {inviteCheck.status === "checking" && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking code…
                      </p>
                    )}
                    {inviteCheck.status === "valid" && (
                      <p className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3 w-3" /> Joining: {inviteCheck.hospitalName}
                      </p>
                    )}
                    {inviteCheck.status === "invalid" && (
                      <p className="text-xs text-destructive">No hospital found for that code.</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="user@hospital.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div>
                  <PasswordInput
                    id="signup-password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    showStrengthMeter
                    required
                    autoComplete="new-password"
                    placeholder="Min 12 chars with uppercase, lowercase, digit & symbol"
                  />
                  {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
                </div>
                <div>
                  <PasswordInput
                    id="confirm-password"
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    required
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                  />
                  {errors.confirm && <p className="text-sm text-destructive mt-1">{errors.confirm}</p>}
                </div>
                {errors.onboarding && <p className="text-sm text-destructive">{errors.onboarding}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Creating account..." : signupMode === "create" ? "Create Hospital & Sign Up" : "Join & Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
