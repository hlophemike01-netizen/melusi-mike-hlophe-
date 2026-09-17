import type { Metadata } from 'next';
import { AdminMetricCard } from '@/features/admin/AdminMetricCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { createClient } from '@/lib/supabase/server';
import { getDashboardMetrics, listEmergencyOverview } from '@/services/admin.service';

export const metadata: Metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const [metrics, emergencies] = await Promise.all([
    getDashboardMetrics(supabase),
    listEmergencyOverview(supabase, 25),
  ]);

  if (!metrics) {
    return <EmptyState icon="📊" title="Metrics unavailable" description="Please try again." />;
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-secondary">
          At a glance
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <AdminMetricCard
            label="Total users"
            value={metrics.total_users}
            detail={`${metrics.active_users} active`}
          />
          <AdminMetricCard
            label="Active activities"
            value={metrics.active_activities}
            detail="Count only — no locations"
          />
          <AdminMetricCard
            label="Groups"
            value={metrics.total_groups}
            detail={`${metrics.active_groups} active`}
          />
          <AdminMetricCard
            label="Open reports"
            value={metrics.open_reports}
            detail={`${metrics.total_reports} total`}
            tone={metrics.open_reports > 0 ? 'alert' : 'neutral'}
          />
          <AdminMetricCard
            label="Active emergencies"
            value={metrics.active_emergencies}
            detail={`${metrics.emergencies_last_7d} in last 7 days`}
            tone={metrics.active_emergencies > 0 ? 'alert' : 'neutral'}
          />
          <AdminMetricCard
            label="Suspended accounts"
            value={metrics.suspended_users}
          />
        </div>
      </section>

      <Card>
        <CardHeader
          title="Emergency events"
          description="Status and timing only. Locations are not available to administrators."
        />
        {emergencies.length === 0 ? (
          <p className="text-sm text-secondary">No emergency events recorded.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-subtle text-left text-xs uppercase tracking-wide text-secondary">
                  <th scope="col" className="py-2 pr-4 font-semibold">Person</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Contacts alerted</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Location captured</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Triggered</th>
                </tr>
              </thead>
              <tbody>
                {emergencies.map((event) => (
                  <tr key={event.id} className="border-b border-subtle last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{event.display_name}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={
                          event.status === 'active'
                            ? 'rounded-full bg-alert-50 px-2 py-0.5 text-xs font-semibold text-alert-700 dark:bg-alert-600/20 dark:text-alert-50'
                            : 'text-secondary'
                        }
                      >
                        {event.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">{event.contacts_notified_count}</td>
                    <td className="py-2.5 pr-4 text-secondary">
                      {event.location_available ? 'Yes (not visible here)' : 'No'}
                    </td>
                    <td className="py-2.5 pr-4 text-secondary">
                      {new Date(event.triggered_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
