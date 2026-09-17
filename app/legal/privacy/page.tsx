import type { Metadata } from 'next';
import Link from 'next/link';
import { SAFETY_COPY } from '@/lib/constants';
import { COMMUNITY_GRID_DEGREES, K_ANONYMITY_THRESHOLD, gridSizeMetres } from '@/lib/geo';

export const metadata: Metadata = { title: 'How we handle your location' };

/**
 * User-facing privacy explanation.
 *
 * Written to be read by the person deciding whether to trust the app, not by a
 * lawyer. Everything here is a description of behaviour the code actually
 * enforces — see docs/PRIVACY.md and docs/LOCATION_MODEL.md for the technical
 * counterpart.
 */
export default function PrivacyExplainerPage() {
  const gridMetres = gridSizeMetres(-33, COMMUNITY_GRID_DEGREES);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm font-semibold text-brand-700 dark:text-brand-300">
        ← Back
      </Link>

      <h1 className="mt-5 text-3xl font-bold tracking-tight">How SafeCircle handles your location</h1>
      <p className="mt-3 text-base leading-relaxed text-secondary">
        SafeCircle is built so that it cannot become a tracking system, even by accident. This page
        explains exactly what is collected, who can see it and how long it lasts.
      </p>

      <Section title="Nothing is shared until you turn it on">
        <p>
          Location sharing is off when you create your account. SafeCircle does not ask your browser
          for your location while you browse — the permission prompt only appears when you start
          something that needs it, and you can decline.
        </p>
        <p>{SAFETY_COPY.locationOptional}</p>
      </Section>

      <Section title="You choose who can see you, every time">
        <p>Each activity has one visibility setting, and it is the only thing that grants access:</p>
        <ul>
          <li>
            <strong>Private</strong> — nobody sees your location. Not other members, not
            administrators.
          </li>
          <li>
            <strong>Trusted contacts</strong> — only the specific contacts you select, and only
            until the activity ends or you revoke it.
          </li>
          <li>
            <strong>Group</strong> — only approved members of the one group you choose. People with
            a pending request see nothing.
          </li>
          <li>
            <strong>Community count</strong> — you are added to an area total. Nobody receives a
            coordinate.
          </li>
        </ul>
        <p>{SAFETY_COPY.onlyAuthorised}</p>
      </Section>

      <Section title="Precise locations are temporary">
        <p>
          Every location point we store carries its own expiry. When an activity ends, its points
          are deleted immediately — not archived, not anonymised and kept, deleted. A background job
          removes anything expired at least every fifteen minutes.
        </p>
        <p>
          There is no feature anywhere in SafeCircle that shows another person&apos;s movement over
          time. Someone you have authorized sees your current position and nothing else.
        </p>
      </Section>

      <Section title="The community map shows counts, not people">
        <p>
          The map never shows where an individual is. Positions are rounded to a grid of about{' '}
          {gridMetres} metres before they are counted, and any area with fewer than{' '}
          {K_ANONYMITY_THRESHOLD} people is hidden entirely — so a single person can never be picked
          out of a count.
        </p>
        <p>
          Only people who chose the community-count option appear at all. Private, group and
          trusted-contact activities are excluded unless their owner explicitly opts in.
        </p>
      </Section>

      <Section title="What other members can see about you">
        <p>
          Members of groups you belong to can see your display name, avatar and the area label you
          chose. Your email address and phone number are never shown to another member. There is no
          way to search for a person by name, email or number — that is deliberate.
        </p>
      </Section>

      <Section title="What SafeCircle staff can see">
        <p>
          Administrators can see how many people use SafeCircle, review reports and suspend
          accounts. They <strong>cannot</strong> see your location, your activities or your trusted
          contacts. That is enforced by the database, not by a policy — the access simply does not
          exist. Every administrative action is recorded in an append-only log.
        </p>
      </Section>

      <Section title="Emergency mode">
        <p>
          Activating emergency mode alerts the trusted contacts you have set up and shares your
          location with them. <strong>It does not contact police, ambulance or fire services.</strong>{' '}
          SafeCircle has no connection to emergency services.
        </p>
        <p>{SAFETY_COPY.notEmergencyServices}</p>
      </Section>

      <Section title="Limits you should know about">
        <p>{SAFETY_COPY.backgroundLimitation}</p>
        <p>{SAFETY_COPY.noGuarantee}</p>
        <p>
          SafeCircle cannot send SMS messages or make phone calls. Contacts without a SafeCircle
          account receive a link that you send them yourself.
        </p>
      </Section>

      <Section title="Your controls">
        <ul>
          <li>Turn location sharing off entirely — this also ends anything running.</li>
          <li>Revoke every active share in one tap.</li>
          <li>Delete all stored location points at any time.</li>
          <li>Block someone, which instantly ends any sharing between you both ways.</li>
        </ul>
        <p>
          These live in{' '}
          <Link href="/profile/privacy" className="font-semibold underline">
            Privacy &amp; location
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-secondary [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
