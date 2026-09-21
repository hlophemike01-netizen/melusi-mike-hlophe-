import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { ActivityRow, EmergencyEventRow, ProfileRow } from '@/types/database';

type Tone = 'calm' | 'active' | 'caution' | 'alert';

const TONES: Record<Tone, { container: string; dot: string }> = {
  calm: { container: 'border-subtle', dot: 'bg-ink-400' },
  active: { container: 'border-safe-500/40 bg-safe-50 dark:bg-safe-500/10', dot: 'bg-safe-500' },
  caution: {
    container: 'border-caution-500/40 bg-caution-50 dark:bg-caution-500/10',
    dot: 'bg-caution-500',
  },
  alert: {
    container: 'border-alert-600/50 bg-alert-50 dark:bg-alert-600/10',
    dot: 'bg-alert-600 animate-emergency-pulse',
  },
};

/**
 * The first thing on the dashboard: what is currently true about this person's
 * safety state, in one sentence.
 *
 * It states what is being shared and with whom, because "am I broadcasting
 * right now?" is the question a privacy-conscious user opens the app to answer.
 */
export function SafetyStatus({
  profile,
  activity,
  emergency,
}: {
  profile: ProfileRow;
  activity: ActivityRow | null;
  emergency: EmergencyEventRow | null;
}) {
  const { tone, headline, detail } = describeStatus(profile, activity, emergency);
  const styles = TONES[tone];

  return (
    <Card className={cn('border-2', styles.container)}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-full', styles.dot)}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
            Safety status
          </p>
          <p className="mt-0.5 text-lg font-bold leading-snug">{headline}</p>
          <p className="mt-1 text-sm text-secondary">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

export function describeStatus(
  profile: Pick<ProfileRow, 'location_sharing_enabled'>,
  activity: ActivityRow | null,
  emergency: EmergencyEventRow | null,
): { tone: Tone; headline: string; detail: string } {
  if (emergency) {
    return {
      tone: 'alert',
      headline: 'Emergency mode is on',
      detail:
        'Your trusted contacts have been alerted and can see your location. Emergency services have not been contacted.',
    };
  }

  if (activity?.status === 'overdue') {
    return {
      tone: 'caution',
      headline: 'You missed a check-in',
      detail:
        'Your trusted contacts may have been alerted. Let them know you are safe when you can.',
    };
  }

  if (activity) {
    return {
      tone: 'active',
      headline: 'Activity in progress',
      detail: describeSharing(activity),
    };
  }

  if (!profile.location_sharing_enabled) {
    return {
      tone: 'calm',
      headline: 'Nothing is being shared',
      detail:
        'Location sharing is off. Turn it on when you want to start a safety activity — it stays optional.',
    };
  }

  return {
    tone: 'calm',
    headline: 'Nothing is being shared',
    detail: 'No activity is running, so nobody can see your location right now.',
  };
}

function describeSharing(activity: ActivityRow): string {
  switch (activity.visibility) {
    case 'private':
      return 'Nobody can see your location. This activity is private to you.';
    case 'nearby':
      return 'You are counted in an approximate area total. Nobody receives your coordinates.';
    case 'group':
      return 'Approved members of your group can see your location until this activity ends.';
    case 'trusted_contacts':
      return 'Your chosen trusted contacts can see your location until this activity ends.';
    default:
      return 'This activity is running.';
  }
}
