import { requireAgencyUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { createBusinessAction } from "../../actions";

export const metadata = { title: "Add client" };

export default async function NewClient() {
  await requireAgencyUser();
  return (
    <>
      <PageHeader title="Add a client" subtitle="You can connect Google, tracking numbers and logins on the next screen." />
      <div className="card card-pad max-w-2xl">
        <ActionForm action={createBusinessAction} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Business name *</label><input name="name" required className="input" placeholder="Fischer Mobile Detailing" /></div>
          <div><label className="label">Category</label><input name="category" className="input" placeholder="Mobile detailing" /></div>
          <div><label className="label">Website</label><input name="website" className="input" placeholder="https://" /></div>
          <div><label className="label">Business phone (public)</label><input name="phone" className="input" /></div>
          <div><label className="label">Owner&apos;s cell — calls forward here</label><input name="forwardToPhone" className="input" placeholder="(555) 123-4567" /></div>
          <div><label className="label">City</label><input name="city" className="input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">State</label><input name="state" className="input" maxLength={2} placeholder="CA" /></div>
            <div><label className="label">ZIP</label><input name="zip" className="input" /></div>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Time zone</label>
            <select name="timezone" className="input" defaultValue="America/New_York">
              {["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "Europe/London"].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2"><SubmitButton pendingLabel="Creating…">Create client</SubmitButton></div>
        </ActionForm>
      </div>
    </>
  );
}
