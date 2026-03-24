import { Check, Circle } from 'lucide-react';
import { PasswordPolicy } from '@ghostcast/shared';

interface PasswordRequirementsProps {
  password: string;
  policy: PasswordPolicy;
  className?: string;
}

interface Requirement {
  label: string;
  met: boolean;
}

function getRequirements(password: string, policy: PasswordPolicy): Requirement[] {
  const requirements: Requirement[] = [
    {
      label: `At least ${policy.minLength} characters`,
      met: password.length >= policy.minLength,
    },
  ];

  if (policy.requireUppercase) {
    requirements.push({
      label: 'One uppercase letter',
      met: /[A-Z]/.test(password),
    });
  }

  if (policy.requireLowercase) {
    requirements.push({
      label: 'One lowercase letter',
      met: /[a-z]/.test(password),
    });
  }

  if (policy.requireNumber) {
    requirements.push({
      label: 'One number',
      met: /\d/.test(password),
    });
  }

  if (policy.requireSpecial) {
    requirements.push({
      label: 'One special character',
      met: /[^A-Za-z0-9]/.test(password),
    });
  }

  return requirements;
}

export function passwordMeetsPolicy(password: string, policy: PasswordPolicy): boolean {
  return getRequirements(password, policy).every((r) => r.met);
}

export function PasswordRequirements({ password, policy, className }: Readonly<PasswordRequirementsProps>) {
  const requirements = getRequirements(password, policy);

  // Don't render if there's only the default min-length requirement and no password yet
  if (requirements.length <= 1 && !password) {
    return null;
  }

  return (
    <ul className={`space-y-1.5 text-sm ${className ?? ''}`}>
      {requirements.map((req) => (
        <li key={req.label} className="flex items-center gap-2">
          {req.met ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={req.met ? 'text-green-500' : 'text-muted-foreground'}>
            {req.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
